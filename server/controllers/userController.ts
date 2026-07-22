import { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import openai, { AI_MODEL, AI_RATE_LIMIT_DELAY_MS } from "../configs/openai.js";
import { extractHtml, isRenderableHtml } from "../lib/html.js";

const PROJECT_COST = 5;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Marker used by the client to stop polling when a background job died. */
export const GENERATION_FAILED_MARKER = "[generation-failed]";

// GET USER CRREDITS
export const getUserCredits = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized User" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User Not Found" });
    }

    res.json({ credits: user.credits });
  } catch (error: any) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * Runs the two-step enhance -> generate chain and persists the result.
 *
 * Deliberately fire-and-forget: createUserProject answers with the projectId
 * immediately so the client can navigate and poll. Every failure path must
 * therefore refund the credits AND write an assistant message, otherwise the
 * project sits at current_code: null forever and the client polls into eternity.
 */
const generateInitialWebsite = async (
  projectId: string,
  userId: string,
  initialPrompt: string,
) => {
  try {
    // OpenRouter free tier: pause before the first completion.
    if (AI_RATE_LIMIT_DELAY_MS > 0) await delay(AI_RATE_LIMIT_DELAY_MS);

    // ENHANCE USER PROMPT
    const promptEnhanceResponse = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: `
You are a prompt enhancement specialist. Take the user's website request and expand it into a detailed, comprehensive prompt that will help create the best possible website.

  Enhance this prompt by:
  1. Adding specific design details (layout, color scheme, typography)
    2. Specifying key sections and features
    3. Describing the user experience and interactions
    4. Including modern web design best practices
    5. Mentioning responsive design requirements
    6. Adding any missing but important elements

Return ONLY the enhanced prompt, nothing else. Make it detailed but concise (2-3 paragraphs max).`,
        },
        {
          role: "user",
          content: initialPrompt,
        },
      ],
    });

    // Fall back to the raw prompt if the enhancer returns nothing, rather than
    // sending the literal string "null" to the code generator.
    const enhancedPrompt =
      promptEnhanceResponse.choices[0]?.message?.content?.trim() ||
      initialPrompt;

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
        content: "Now generating your Website...",
        projectId,
      },
    });

    // Generate Website Code
    const codeGenerationResponse = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: `

You are an expert web developer. Create a complete, production-ready, single-page website based on this request: "${enhancedPrompt}"

    CRITICAL REQUIREMENTS:
    - You MUST output valid HTML ONLY.
    - Use Tailwind CSS for ALL styling
    - Include this EXACT script in the <head>: <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    - Use Tailwind utility classes extensively for styling, animations, and responsiveness
    - Make it fully functional and interactive with JavaScript in <script> tag before closing </body>
    - Use modern, beautiful design with great UX using Tailwind classes
    - Make it responsive using Tailwind responsive classes (sm:, md:, lg:, xl:)
    - Use Tailwind animations and transitions (animate-*, transition-*)
    - Include all necessary meta tags
    - Use Google Fonts CDN if needed for custom fonts
    - Use placeholder images from https://placehold.co/600x400
    - Use Tailwind gradient classes for beautiful backgrounds
    - Make sure all buttons, cards, and components use Tailwind styling

    CRITICAL HARD RULES:
    1. You MUST put ALL output ONLY into message.content.
    2. You MUST NOT place anything in "reasoning", "analysis", "reasoning_details", or any hidden fields.
    3. You MUST NOT include internal thoughts, explanations, analysis, comments, or markdown.
    4. Do NOT include markdown, explanations, notes, or code fences.

    The HTML should be complete and ready to render as-is with Tailwind CSS.`,
        },
        {
          role: "user",
          content: enhancedPrompt,
        },
      ],
    });

    const code = extractHtml(codeGenerationResponse.choices[0]?.message?.content);

    if (!isRenderableHtml(code)) {
      throw new Error("Model returned no usable HTML");
    }

    // Create Version for the project
    const version = await prisma.version.create({
      data: {
        code,
        description: "Initial Version",
        projectId,
      },
    });

    await prisma.conversation.create({
      data: {
        role: "assistant",
        content:
          "I've Created your Website! You can now preview it and request any changes.",
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
  } catch (error: any) {
    console.log("Background generation failed:", error.code || error.message);

    // Refund and tell the client, so it can stop polling.
    await prisma.user
      .update({
        where: { id: userId },
        data: { credits: { increment: PROJECT_COST } },
      })
      .catch((refundError: any) =>
        console.log("Refund failed:", refundError.code || refundError.message),
      );

    await prisma.conversation
      .create({
        data: {
          role: "assistant",
          content: `${GENERATION_FAILED_MARKER} Generation failed and your credits were refunded. Please try again.`,
          projectId,
        },
      })
      .catch((convError: any) =>
        console.log("Failure notice failed:", convError.code || convError.message),
      );
  }
};

// CREATE USER PROJECT
export const createUserProject = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { initial_prompt } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized User" });
    }

    if (
      !initial_prompt ||
      typeof initial_prompt !== "string" ||
      initial_prompt.trim() === ""
    ) {
      return res.status(400).json({ message: "initial_prompt is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });

    // Previously `user && user.credits < 5` silently skipped the check when the
    // user row was missing, then blew up on the FK insert below.
    if (!user) {
      return res.status(401).json({ message: "Unauthorized User" });
    }

    if (user.credits < PROJECT_COST) {
      return res
        .status(403)
        .json({ message: "add credits to create more projects" });
    }

    const prompt = initial_prompt.trim();

    // Create a new project
    const project = await prisma.websiteProject.create({
      data: {
        name: prompt.length > 50 ? prompt.substring(0, 47) + "..." : prompt,
        initial_prompt: prompt,
        userId,
      },
    });

    await prisma.conversation.create({
      data: {
        role: "user",
        content: prompt,
        projectId: project.id,
      },
    });

    // Charge + bump the creation counter in a single round-trip (was 2 updates).
    await prisma.user.update({
      where: { id: userId },
      data: {
        credits: { decrement: PROJECT_COST },
        totalCreation: { increment: 1 },
      },
    });

    // Answer now; generation continues in the background and the client polls.
    res.json({ projectId: project.id });

    void generateInitialWebsite(project.id, userId, prompt);
  } catch (error: any) {
    console.log(error.code || error.message);
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }
  }
};

// GET A SINGLE USER PROJECT
export const getUserProject = async (
  req: Request<{ projectId: string }>,
  res: Response,
) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized User" });
    }

    const { projectId } = req.params;

    const project = await prisma.websiteProject.findUnique({
      where: { id: projectId, userId },
      include: {
        conversation: {
          orderBy: { timestamp: "asc" },
        },
        // Version code is large and unused by the builder UI, which only lists
        // timestamps and rolls back by id. Omitting it keeps the 10s poll cheap.
        versions: {
          orderBy: { timestamp: "asc" },
          select: { id: true, timestamp: true, description: true },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ message: "Project Not Found" });
    }

    res.json({ project });
  } catch (error: any) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// GET ALL USERS PROJECT (S)
export const getUserProjectS = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized User" });
    }

    const projects = await prisma.websiteProject.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ projects });
  } catch (error: any) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// TOGGLE PROJECT PUBLISH BY USER
export const tooglePublish = async (
  req: Request<{ projectId: string }>,
  res: Response,
) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized User" });
    }
    const { projectId } = req.params;
    const project = await prisma.websiteProject.findUnique({
      where: { id: projectId, userId },
      select: { isPublished: true, current_code: true },
    });

    if (!project) {
      return res.status(404).json({ message: "Project Not Found" });
    }

    // Publishing a project that has no code yet puts a dead card in /community.
    if (!project.isPublished && !project.current_code) {
      return res
        .status(400)
        .json({ message: "Wait for the website to finish generating" });
    }

    await prisma.websiteProject.update({
      where: { id: projectId },
      data: { isPublished: !project.isPublished },
    });

    res.json({
      message: project.isPublished
        ? "Project Unpublished"
        : "Project Published Successfully",
      isPublished: !project.isPublished,
    });
  } catch (error: any) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};

// PURCHASE CREDITS — not implemented; no payment provider is wired up yet.
export const purchaseCredits = async (_req: Request, res: Response) => {
  return res
    .status(501)
    .json({ message: "Credit purchases are not available yet" });
};
