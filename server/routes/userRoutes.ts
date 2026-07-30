import  express  from "express";
import { createUserProject, getUserCredits, getUserProject, getUserProjectS, purchaseCredits, streamUserProject, tooglePublish } from "../controllers/userController.js";
import { protect } from "../middlewares/auth.js";

const userRouter = express.Router();

userRouter.get('/credits', protect,  getUserCredits)
userRouter.post('/project', protect,  createUserProject)
userRouter.get('/project/:projectId', protect,  getUserProject)
// Long-lived SSE stream of an in-flight generation. Sits under /api/user, so it
// never reaches the JSON 404 handler, and express.json() ahead of it is a no-op
// for a bodyless GET — no middleware reordering needed.
userRouter.get('/project/:projectId/stream', protect,  streamUserProject)
userRouter.get('/projects', protect,  getUserProjectS)
userRouter.get('/publish-toggle/:projectId', protect,  tooglePublish)
userRouter.post('/purchase-credits', protect,  purchaseCredits)

export default userRouter


