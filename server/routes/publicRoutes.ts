import express from "express";
import { getPublicConfig } from "../controllers/configController.js";

const publicRouter = express.Router();

// Unauthenticated on purpose: the client needs this before anyone signs in.
publicRouter.get("/config", getPublicConfig);

export default publicRouter;
