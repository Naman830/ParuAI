import { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import openai, { AI_MODEL } from "../configs/openai.js";
import { extractHtml, isRenderableHtml } from "../lib/html.js";

const REVISION_COST = 5;

// MAKE REVISON BY ADDING A NEW PROMPT
export const makeRevision = async (
  req: Request<{ projectId: string }>,
  res: Response,
) => {
  const userId = req.userId;
  // Only refund if we actually charged; the old code refunded on *every* error,
  // including "unauthorized", where userId is undefined and the update throws.
  let charged = false;

  try {
    const { projectId } = req.params;
    const { message } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized User" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });

    if (!user) {
      return res.status(401).json({ message: "Unauthorized User" });
    }

    if (user.credits < REVISION_COST) {
      return res
        .status(403)
        .json({ message: "Add more Credit to make changes" });
    }

    if (!message || typeof message !== "string" || message.trim() === "") {
      return res.status(400).json({ message: "Please enter a Valid Prompt" });
    }

    const currentProject = await prisma.websiteProject.findUnique({
      where: { id: projectId, userId },
      select: { current_code: true },
    });

    if (!currentProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Revising before the initial generation finished would send "null" as the
    // base document and produce garbage.
    if (!currentProject.current_code) {
      return res
        .status(409)
        .json({ message: "Wait for the website to finish generating" });
    }

    const prompt = message.trim();

    await prisma.conversation.create({
      data: {
        role: "user",
        content: prompt,
        projectId,
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { credits: { decrement: REVISION_COST } },
    });
    charged = true;

    // Enhance user prompt
    const promptEnhanceResponse = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: `
You are a prompt enhancement specialist. The user wants to make changes to their website. Enhance their request to be more specific and actionable for a web developer.

    Enhance this by:
    1. Being specific about what elements to change
    2. Mentioning design details (colors, spacing, sizes)
    3. Clarifying the desired outcome
    4. Using clear technical terms

Return ONLY the enhanced request, nothing else. Keep it concise (1-2 sentences).`,
        },
        {
          role: "user",
          content: `User's request: "${prompt}"`,
        },
      ],
    });

    const enhancedPrompt =
      promptEnhanceResponse.choices[0]?.message?.content?.trim() || prompt;

    await prisma.conversation.create({
      data: {
        role: "assistant",
        content: `I've enhanced your prompt to: "${enhancedPrompt}"`,
        projectId,
      },
    });

    await prisma.conversation.create({
      data: {
        role: "assistant",
        content: `Now making changes to your website...`,
        projectId,
      },
    });

    // GERNATE WEBSITE CODE
    const codeGenerationResponse = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: `


You are an expert web developer.

    CRITICAL REQUIREMENTS:
    - Return ONLY the complete updated HTML code with the requested changes.
    - Use Tailwind CSS for ALL styling (NO custom CSS).
    - Use Tailwind utility classes for all styling changes.
    - Include all JavaScript in <script> tags before closing </body>
    - Make sure it's a complete, standalone HTML document with Tailwind CSS
    - Return the HTML Code Only, nothing else

    Apply the requested changes while maintaining the Tailwind CSS styling approach.


          `,
        },
        {
          role: "user",
          content: `Here is the current Website code: "${currentProject.current_code}" The user want this change: "${enhancedPrompt}"`,
        },
      ],
    });

    // Revisions previously skipped the preamble slicing that createUserProject
    // does, so model chatter could be persisted as the live document.
    const code = extractHtml(codeGenerationResponse.choices[0]?.message?.content);

    if (!isRenderableHtml(code)) {
      await prisma.conversation.create({
        data: {
          role: "assistant",
          content: "Unable to generate the code, please try again",
          projectId,
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: REVISION_COST } },
      });
      charged = false;

      // The old code returned here without ever responding, leaving the client
      // spinner running until the request timed out.
      return res
        .status(502)
        .json({ message: "Unable to generate the code, please try again" });
    }

    const version = await prisma.version.create({
      data: {
        code,
        description: "changes made",
        projectId,
      },
    });

    await prisma.conversation.create({
      data: {
        role: "assistant",
        content: "I've made the changes to your website! You can now preview it",
        projectId,
      },
    });

    await prisma.websiteProject.update({
      where: { id: projectId },
      data: {
        current_code: code,
        current_version_index: version.id,
      },
    });

    res.json({ message: "Changes made successfully" });
  } catch (error: any) {
    if (charged && userId) {
      await prisma.user
        .update({
          where: { id: userId },
          data: { credits: { increment: REVISION_COST } },
        })
        .catch((refundError: any) =>
          console.log("Refund failed:", refundError.code || refundError.message),
        );
    }

    console.log(error.code || error.message);
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }
  }
};

// ROLLBACK TO A SPECIFIC VERSION
export const rollbackToVersion = async (
  req: Request<{ projectId: string; versionId: string }>,
  res: Response,
) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized " });
    }

    const { projectId, versionId } = req.params;

    const project = await prisma.websiteProject.findUnique({
      where: { id: projectId, userId },
      select: { id: true },
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Fetch just the target version instead of loading every version's HTML
    // into memory to run an in-JS .find().
    const version = await prisma.version.findFirst({
      where: { id: versionId, projectId },
    });

    if (!version) {
      return res.status(404).json({ message: "Version not found" });
    }

    await prisma.websiteProject.update({
      where: { id: projectId },
      data: {
        current_code: version.code,
        current_version_index: version.id,
      },
    });

    await prisma.conversation.create({
      data: {
        role: "assistant",
        content:
          "I've rolled back your website to selected version. You can now preview it",
        projectId,
      },
    });
    res.json({ message: "Version rolled back" });
  } catch (error: any) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// DELETE ANY PROJECT
export const deleteProject = async (
  req: Request<{ projectId: string }>,
  res: Response,
) => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // deleteMany scopes by owner and reports 0 instead of throwing P2025, so a
    // wrong id returns 404 rather than a 500.
    const { count } = await prisma.websiteProject.deleteMany({
      where: { id: projectId, userId },
    });

    if (count === 0) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({ message: "Project Deleted Successfully" });
  } catch (error: any) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// GETTING PROJECT CODE FOR PREVIEW (optionally a specific version)
export const getProjectPreview = async (
  req: Request<{ projectId: string }>,
  res: Response,
) => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;
    const versionId =
      typeof req.query.versionId === "string" ? req.query.versionId : undefined;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const project = await prisma.websiteProject.findFirst({
      where: { id: projectId, userId },
      select: { id: true, name: true, current_code: true },
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Version preview: return only the requested snapshot. The old endpoint
    // shipped every version's full HTML and the client picked one client-side.
    if (versionId) {
      const version = await prisma.version.findFirst({
        where: { id: versionId, projectId },
        select: { code: true },
      });

      if (!version) {
        return res.status(404).json({ message: "Version not found" });
      }

      return res.json({ code: version.code, name: project.name });
    }

    res.json({ code: project.current_code, name: project.name });
  } catch (error: any) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// GET PUBLISHED PROJECT
export const getPublishedProject = async (_req: Request, res: Response) => {
  try {
    const projects = await prisma.websiteProject.findMany({
      where: { isPublished: true, current_code: { not: null } },
      orderBy: { updatedAt: "desc" },
      // `include: { user: true }` leaked every publisher's email address on this
      // unauthenticated endpoint. Only the display name is needed for the card.
      select: {
        id: true,
        name: true,
        initial_prompt: true,
        current_code: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { name: true } },
      },
    });

    res.json({ projects });
  } catch (error: any) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// GET A SINGLE PROJECT BY ID
export const getProjectById = async (
  req: Request<{ projectId: string }>,
  res: Response,
) => {
  try {
    const { projectId } = req.params;

    const project = await prisma.websiteProject.findFirst({
      where: { id: projectId, isPublished: true },
      select: { current_code: true },
    });

    if (!project || !project.current_code) {
      return res.status(404).json({ message: "Project Not Found" });
    }

    res.json({ code: project.current_code });
  } catch (error: any) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// SAVE PROJECT CODE
export const saveProjectCode = async (
  req: Request<{ projectId: string }>,
  res: Response,
) => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;
    const { code } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized " });
    }

    if (!code || typeof code !== "string" || code.trim() === "") {
      return res.status(400).json({ message: "Code is Required" });
    }

    const project = await prisma.websiteProject.findUnique({
      where: { id: projectId, userId },
      select: { id: true },
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // A manual save is a new snapshot, not a detachment: the old code set
    // current_version_index to "" which orphaned the project from every Version
    // and made the sidebar lose its "Current Version" marker.
    const version = await prisma.version.create({
      data: { code, description: "manual save", projectId },
    });

    await prisma.websiteProject.update({
      where: { id: projectId },
      data: { current_code: code, current_version_index: version.id },
    });

    // Was `messsage`, so the client toasted "undefined".
    res.json({ message: "Project saved successfully" });
  } catch (error: any) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};
