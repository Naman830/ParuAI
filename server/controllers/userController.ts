import { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import openai, { AI_MODEL, AI_RATE_LIMIT_DELAY_MS } from "../configs/openai.js";
import {
  createHtmlStreamTrimmer,
  extractHtml,
  isRenderableHtml,
} from "../lib/html.js";
import {
  ASSISTANT_MESSAGES,
  GENERATION_FAILED_MARKER,
  enhancedPromptMessage,
  generationFailedMessage,
} from "../lib/conversation.js";
import {
  MAX_SUBSCRIBERS_PER_PROJECT,
  attachSubscriber,
  hasLiveJob,
  openJob,
  subscriberCount,
} from "../lib/generationStream.js";
import { streamChatCompletion } from "../lib/aiStream.js";

const PROJECT_COST = 5;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Marker used by the client to stop polling when a background job died.
 *
 * Re-exported rather than redefined: the string now lives in lib/conversation.ts
 * so the revision-history filter and this writer cannot drift. It is matched in
 * client/src/pages/Projects.tsx — never change it on one side only.
 */
export { GENERATION_FAILED_MARKER };

/**
 * Runs the two-step enhance -> generate chain and persists the result.
 *
 * Deliberately fire-and-forget: createUserProject answers with the projectId
 * immediately so the client can navigate and watch. Every failure path must
 * therefore refund the credits AND write an assistant message, otherwise the
 * project sits at current_code: null forever.
 *
 * The `status` column is the primary signal now; the [generation-failed] marker
 * is still written so an older cached client bundle keeps working.
 */
const generateInitialWebsite = async (
  projectId: string,
  userId: string,
  initialPrompt: string,
) => {
  // MUST be the first statement, before any await. `void generateInitialWebsite()`
  // runs synchronously up to its first await, so the stream channel exists in the
  // same tick as res.json({ projectId }) — long before the browser can connect.
  // This closes the subscriber registration race and stops the on-demand sweep
  // from ever seeing a brand-new project as stranded.
  const job = openJob(projectId, "initial");

  try {
    // OpenRouter free tier: pause before the first completion.
    if (AI_RATE_LIMIT_DELAY_MS > 0) await delay(AI_RATE_LIMIT_DELAY_MS);

    await prisma.websiteProject.update({
      where: { id: projectId },
      data: { status: "generating" },
    });

    // ENHANCE USER PROMPT — deliberately NOT streamed. Its output is a short
    // internal brief the user never watches; streaming it would just show them
    // prompt engineering for 40 seconds.
    job.setPhase("enhancing");
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
        content: enhancedPromptMessage(enhancedPrompt),
        projectId,
      },
    });

    await prisma.conversation.create({
      data: {
        role: "assistant",
        content: ASSISTANT_MESSAGES.GENERATING,
        projectId,
      },
    });

    // Generate Website Code — streamed, so the browser can paint the page as it
    // is written instead of staring at a fake progress animation for minutes.
    // The trimmer suppresses fences/preamble for DISPLAY only; the DB still gets
    // extractHtml() over the fully accumulated string below.
    job.setPhase("generating");
    const trim = createHtmlStreamTrimmer();
    const raw = await streamChatCompletion(
      [
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
      (piece) => job.push(trim(piece)),
    );

    job.setPhase("saving");
    const code = extractHtml(raw);

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
        content: ASSISTANT_MESSAGES.CREATED,
        projectId,
      },
    });

    // Unconditional update on purpose: if a sweep already flagged this row
    // failed, a document that actually arrived should still win.
    await prisma.websiteProject.update({
      where: { id: projectId },
      data: {
        current_code: code,
        current_version_index: version.id,
        status: "ready",
      },
    });

    job.finish("ready");
  } catch (error: any) {
    console.log("Background generation failed:", error.code || error.message);

    // Compare-and-swap. On a single instance `count` is always 1, so this is
    // behaviour-identical to the old unconditional refund — it exists purely so
    // the new boot sweep can never pay the same failure twice.
    const { count } = await prisma.websiteProject
      .updateMany({
        where: { id: projectId, status: { in: ["pending", "generating"] } },
        data: { status: "failed" },
      })
      .catch((casError: any) => {
        console.log("Status CAS failed:", casError.code || casError.message);
        return { count: 0 };
      });

    if (count === 1) {
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
            content: generationFailedMessage(),
            projectId,
          },
        })
        .catch((convError: any) =>
          console.log("Failure notice failed:", convError.code || convError.message),
        );
    }

    job.finish("failed", "Generation failed and your credits were refunded.");
  }
};

/**
 * Repairs generations that no longer have a process behind them.
 *
 * Lives here rather than in its own module because it needs prisma,
 * PROJECT_COST and GENERATION_FAILED_MARKER. A separate lib/generationSweep.ts
 * would either import this controller (a cycle) or duplicate the marker into a
 * third place, which is exactly the "change the marker on one side only" hazard.
 */
export const sweepStaleGenerations = async (opts?: {
  projectIds?: string[];
  minAgeMs?: number;
}) => {
  try {
    const stranded = await prisma.websiteProject.findMany({
      where: {
        status: { in: ["pending", "generating"] },
        ...(opts?.projectIds ? { id: { in: opts.projectIds } } : {}),
        ...(opts?.minAgeMs
          ? { updatedAt: { lt: new Date(Date.now() - opts.minAgeMs) } }
          : {}),
      },
      select: { id: true, userId: true, current_code: true },
    });

    for (const row of stranded) {
      // A no-op at boot (the map is empty), but correct for the on-demand caller
      // and it documents that a live job is never touched.
      if (hasLiveJob(row.id)) continue;

      // A revision that died leaves usable code behind, so the DOCUMENT is
      // ready even though the request failed. Only a project that never
      // produced code is genuinely failed.
      const nextStatus = row.current_code ? "ready" : "failed";

      // `current_code` is re-asserted in the CAS, not just read from the findMany
      // above: a generation can finish between the two, and a refund for a
      // project that now HAS a document would be paying for work that landed.
      // Re-checking it here makes that impossible rather than merely unlikely.
      const { count } = await prisma.websiteProject.updateMany({
        where: {
          id: row.id,
          status: { in: ["pending", "generating"] },
          ...(nextStatus === "failed" ? { current_code: null } : {}),
        },
        data: { status: nextStatus },
      });

      // Someone else already moved this row out of an in-progress state, so
      // they own the refund. At-most-once.
      if (count !== 1) continue;
      if (nextStatus === "ready") continue;

      await prisma.user
        .update({
          where: { id: row.userId },
          data: { credits: { increment: PROJECT_COST } },
        })
        .catch((e: any) => console.log("Sweep refund failed:", e.code || e.message));

      await prisma.conversation
        .create({
          data: {
            role: "assistant",
            content: generationFailedMessage(
              "The server restarted while your website was being generated, so your credits were refunded. Please try again.",
            ),
            projectId: row.id,
          },
        })
        .catch((e: any) => console.log("Sweep notice failed:", e.code || e.message));

      console.log(`Swept stranded generation ${row.id} (refunded ${PROJECT_COST})`);
    }

    if (stranded.length > 0) {
      console.log(`Generation sweep examined ${stranded.length} stranded project(s)`);
    }
  } catch (error: any) {
    console.log("Generation sweep failed:", error.code || error.message);
  }
};

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

    // Create a new project. `status` comes from the schema default (pending).
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

    // Answer now; generation continues in the background and the client watches
    // it over SSE (falling back to the poll).
    res.json({ projectId: project.id });

    void generateInitialWebsite(project.id, userId, prompt);
  } catch (error: any) {
    console.log(error.code || error.message);
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }
  }
};

/**
 * Live view of a generation, as Server-Sent Events.
 *
 * STRUCTURAL RULE: everything that can throw or answer 4xx happens BEFORE
 * attachSubscriber() flushes headers. After the flush the handler is synchronous
 * and non-throwing, because Express 5 auto-forwards a rejected async handler to
 * the final error middleware — whose `if (res.headersSent) return;` would log
 * and then leave the socket open forever.
 */
export const streamUserProject = async (
  req: Request<{ projectId: string }>,
  res: Response,
) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized User" });
    }

    const { projectId } = req.params;

    const select = { status: true, current_code: true } as const;
    let project = await prisma.websiteProject.findUnique({
      where: { id: projectId, userId },
      select,
    });

    if (!project) {
      return res.status(404).json({ message: "Project Not Found" });
    }

    // Self-heal a job whose process died, without waiting for a restart. The
    // minAgeMs guard is a second belt against the openJob registration race.
    if (
      (project.status === "pending" || project.status === "generating") &&
      !hasLiveJob(projectId)
    ) {
      await sweepStaleGenerations({ projectIds: [projectId], minAgeMs: 60_000 });
      project =
        (await prisma.websiteProject.findUnique({
          where: { id: projectId, userId },
          select,
        })) ?? project;
    }

    if (subscriberCount(projectId) >= MAX_SUBSCRIBERS_PER_PROJECT) {
      return res
        .status(503)
        .json({ message: "Too many live streams for this project" });
    }

    const terminal =
      project.status === "ready" || project.status === "failed"
        ? project.status
        : null;

    attachSubscriber({
      projectId,
      req,
      res,
      terminal,
      kindHint: project.current_code ? "revision" : "initial",
    });
  } catch (error: any) {
    console.log(error.code || error.message);
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }
    // Headers are already out, so the JSON error handler cannot answer and would
    // leak this socket. Close it ourselves.
    res.end();
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
