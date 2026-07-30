import express from 'express'
import { protect } from '../middlewares/auth.js';
import { auditProject, deleteProject, getProjectById, getProjectPreview, getPublishedProject, makeRevision, rollbackToVersion, saveProjectCode } from '../controllers/projectController.js';

const projectRouter = express.Router();

projectRouter.post('/revision/:projectId', protect, makeRevision)
projectRouter.put('/save/:projectId', protect, saveProjectCode)
// Free: pure computation over the saved document, no AI call.
projectRouter.get('/audit/:projectId', protect, auditProject)
projectRouter.get('/rollback/:projectId/:versionId', protect, rollbackToVersion)
projectRouter.delete('/:projectId', protect, deleteProject)
projectRouter.get('/preview/:projectId', protect, getProjectPreview)
projectRouter.get('/published', getPublishedProject)
projectRouter.get('/published/:projectId', getProjectById)


export default projectRouter
