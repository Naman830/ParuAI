process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT ERROR:", err.stack);
});

// Background generation is fire-and-forget; an unhandled rejection would have
// taken the whole process down under Node's default behaviour.
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";

import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import userRouter from "./routes/userRoutes.js";
import projectRouter from "./routes/projectRoutes.js";
import publicRouter from "./routes/publicRoutes.js";
import { sweepStaleGenerations } from "./controllers/userController.js";

const app = express();
const port = process.env.PORT || 3000;

const trustedOrigins =
  process.env.TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) || [];

if (trustedOrigins.length === 0) {
  console.warn(
    "TRUSTED_ORIGINS is empty — every browser request will be blocked by CORS.",
  );
}

const corsOptions = {
  // Whitespace around a comma in TRUSTED_ORIGINS used to silently produce an
  // origin that never matched.
  origin: trustedOrigins,
  credentials: true,
};

// Middleware
// NOTE: the better-auth handler MUST stay above express.json().
app.use(cors(corsOptions));
app.all("/api/auth/{*any}", toNodeHandler(auth));
app.use(express.json({ limit: "50mb" }));

// ROUTE
app.get("/", (_req: Request, res: Response) => {
  res.send("Server is Live!");
});
app.use("/api/user", userRouter);
app.use("/api/project", projectRouter);
app.use("/api/public", publicRouter);

// Unknown API routes returned Express' HTML error page, which broke the
// client's `error.response.data.message` handling.
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ message: "Route not found" });
});

// Final safety net so a thrown handler answers JSON instead of an HTML stack.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("REQUEST ERROR:", err?.stack || err);
  if (res.headersSent) return;
  res.status(500).json({ message: err?.message || "Internal Server Error" });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);

  // Repair any generation that died with the previous process. Without this a
  // restart mid-generation strands the project at current_code: null with no
  // marker and no refund, and the client polls it forever.
  //
  // ASSUMES A SINGLE INSTANCE, which is what Render's free plan runs. With two
  // instances a booting one would see the other's live generations as stranded;
  // the compare-and-swap in sweepStaleGenerations keeps the refund at-most-once
  // even then, but set GENERATION_SWEEP_ON_BOOT=false before scaling out.
  //
  // Inside the listen callback rather than before it, so the sweep's DB
  // round-trips cannot delay Render's health check on /.
  if (process.env.GENERATION_SWEEP_ON_BOOT !== "false") {
    void sweepStaleGenerations();
  }
});
