import { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import openai, { AI_MODEL } from "../configs/openai.js";
import {
  createHtmlStreamTrimmer,
  ensureDoctype,
  extractHtml,
  isRenderableHtml,
} from "../lib/html.js";
import {
  ASSISTANT_MESSAGES,
  enhancedPromptMessage,
  formatRevisionHistory,
} from "../lib/conversation.js";
import {
  openJob,
  type GenerationJobHandle,
} from "../lib/generationStream.js";
import { streamChatCompletion } from "../lib/aiStream.js";
import { auditHtml, buildFixInstruction } from "../lib/audit.js";

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
  // Lifetime mirrors `charged` exactly, which is why no early return needs to
  // finish it. The finally block is the backstop.
  let job: GenerationJobHandle | null = null;

  try {
    const { projectId } = req.params;
    const { message } = req.body;
    // Opt-out of the prompt enhancer. The enhancer is told to return "1-2
    // sentences", which is right for vague human prose but destroys an already
    // precise machine-generated instruction — the audit's "Fix with AI" sends a
    // numbered list of markup fixes and needs every item to survive. Defaults to
    // true so the Sidebar chat behaves exactly as before.
    const skipEnhance = req.body?.enhance === false;

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

    // Read the history BEFORE writing the new user row, or the current prompt
    // shows up twice — once as history and once as the request.
    const priorTurns = await prisma.conversation.findMany({
      where: { projectId },
      orderBy: { timestamp: "asc" },
      select: { role: true, content: true },
    });
    const history = formatRevisionHistory(priorTurns);

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

    job = openJob(projectId, "revision");
    await prisma.websiteProject.update({
      where: { id: projectId },
      data: { status: "generating" },
    });

    // Enhance user prompt. Skipped entirely for machine-generated instructions,
    // which also removes one 37-72s call with a ~1/3 failure rate from that flow.
    let enhancedPrompt = prompt;

    if (!skipEnhance) {
      job.setPhase("enhancing");
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

Earlier requests are provided for context — resolve pronouns and relative words ("it", "that", "darker", "bigger") against them, and describe the change in absolute terms.

Return ONLY the enhanced request, nothing else. Keep it concise (1-2 sentences).`,
          },
          {
            role: "user",
            // Without the history the model has no idea what "it" refers to, so
            // "make it blue" then "actually darker" resolved against nothing.
            content: history
              ? `${history}\n\nUser's new request: "${prompt}"`
              : `User's request: "${prompt}"`,
          },
        ],
      });

      enhancedPrompt =
        promptEnhanceResponse.choices[0]?.message?.content?.trim() || prompt;

      await prisma.conversation.create({
        data: {
          role: "assistant",
          content: enhancedPromptMessage(enhancedPrompt),
          projectId,
        },
      });
    }

    await prisma.conversation.create({
      data: {
        role: "assistant",
        content: ASSISTANT_MESSAGES.REVISING,
        projectId,
      },
    });

    // GERNATE WEBSITE CODE — streamed, so the user watches the rewrite happen.
    job.setPhase("generating");
    const trim = createHtmlStreamTrimmer();
    const raw = await streamChatCompletion(
      [
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
          // The original request is passed through alongside the enhanced one:
          // the enhancer is lossy by design (it is told to return 1-2 sentences),
          // and previously the generator only ever saw its output.
          content: `Here is the current Website code: "${currentProject.current_code}" The user's request: "${prompt}" Interpreted as: "${enhancedPrompt}"`,
        },
      ],
      (piece) => job?.push(trim(piece)),
    );

    // Revisions previously skipped the preamble slicing that createUserProject
    // does, so model chatter could be persisted as the live document.
    job.setPhase("saving");
    const code = extractHtml(raw);

    if (!isRenderableHtml(code)) {
      await prisma.conversation.create({
        data: {
          role: "assistant",
          content: ASSISTANT_MESSAGES.UNUSABLE_OUTPUT,
          projectId,
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: REVISION_COST } },
      });
      charged = false;

      // Back to `ready`, NOT `failed`: the previous document is still intact and
      // usable. Marking it failed would make the boot sweep refund again and
      // strand a working project.
      await prisma.websiteProject.update({
        where: { id: projectId },
        data: { status: "ready" },
      });
      job.finish("failed", ASSISTANT_MESSAGES.UNUSABLE_OUTPUT);

      // The old code returned here without ever responding, leaving the client
      // spinner running until the request timed out.
      return res
        .status(502)
        .json({ message: ASSISTANT_MESSAGES.UNUSABLE_OUTPUT });
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
        content: ASSISTANT_MESSAGES.REVISED,
        projectId,
      },
    });

    await prisma.websiteProject.update({
      where: { id: projectId },
      data: {
        current_code: code,
        current_version_index: version.id,
        status: "ready",
      },
    });

    res.json({ message: "Changes made successfully" });
    job.finish("ready");
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

    // The document is untouched by a failed revision, so it stays usable.
    await prisma.websiteProject
      .updateMany({
        where: { id: req.params.projectId, status: "generating" },
        data: { status: "ready" },
      })
      .catch((statusError: any) =>
        console.log("Status reset failed:", statusError.code || statusError.message),
      );

    console.log(error.code || error.message);
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }
  } finally {
    // Leak-proof backstop. Safe precisely because finish() is idempotent: it
    // no-ops on every path that already finished, and guarantees a channel can
    // never be orphaned if someone later adds a new early return.
    job?.finish("failed", "Generation ended unexpectedly");
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

    // From the catalog, not a literal: selectRevisionHistory() finds the most
    // recent rollback by matching this exact string and discards everything at
    // or before it, because after a rollback the live document is the older
    // snapshot and the requests that produced the abandoned versions no longer
    // describe it. A reworded literal here would silently break that barrier.
    await prisma.conversation.create({
      data: {
        role: "assistant",
        content: ASSISTANT_MESSAGES.ROLLED_BACK,
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

/**
 * SEO + accessibility audit of the project's saved document.
 *
 * GET, not POST: it is a pure, idempotent read of current_code with no body and
 * no side effects, matching GET /api/project/preview/:projectId. It audits
 * exactly the document that gets published and downloaded, which is the question
 * the user is actually asking.
 *
 * FREE — no credits. There is no AI call and no external network here, just
 * regex work over a ~40KB string, and charging would make the
 * audit -> fix -> re-audit loop punitive. The fix itself still costs 5 via the
 * existing revision endpoint.
 */
export const auditProject = async (
  req: Request<{ projectId: string }>,
  res: Response,
) => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const project = await prisma.websiteProject.findFirst({
      where: { id: projectId, userId },
      select: { current_code: true },
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Same status and wording makeRevision uses for the same condition.
    if (!project.current_code) {
      return res
        .status(409)
        .json({ message: "Wait for the website to finish generating" });
    }

    const report = auditHtml(project.current_code);

    res.json({
      report,
      // Composed server-side so the fix wording lives in vitest-tested code and
      // the client never has to re-derive it from a mirrored copy of the checks.
      fixPrompt: buildFixInstruction(report),
      checkedAt: new Date().toISOString(),
    });
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

    // This write path used to persist req.body.code verbatim, which is the one
    // place in the app that bypassed extractHtml/isRenderableHtml. That was
    // survivable while the only caller was the preview iframe, but the code
    // editor lets a user type anything — and saving "hello" as current_code
    // breaks preview, publish, /view/:id and download all at once.
    //
    // ensureDoctype is what stops the saved document from regressing into
    // quirks mode: getCode() serializes documentElement.outerHTML, which never
    // carries a doctype.
    const cleaned = ensureDoctype(extractHtml(code));

    if (!isRenderableHtml(cleaned)) {
      return res
        .status(400)
        .json({ message: "That doesn't look like a valid HTML document" });
    }

    // A manual save is a new snapshot, not a detachment: the old code set
    // current_version_index to "" which orphaned the project from every Version
    // and made the sidebar lose its "Current Version" marker.
    const version = await prisma.version.create({
      data: { code: cleaned, description: "manual save", projectId },
    });

    await prisma.websiteProject.update({
      where: { id: projectId },
      data: { current_code: cleaned, current_version_index: version.id },
    });

    // Was `messsage`, so the client toasted "undefined".
    res.json({ message: "Project saved successfully" });
  } catch (error: any) {
    console.log(error.code || error.message);
    return res.status(500).json({ message: error.message });
  }
};
