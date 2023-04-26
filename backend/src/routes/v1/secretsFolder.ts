import express, { Request, Response } from 'express';
const router = express.Router();
import {
  requireAuth,
  requireWorkspaceAuth,
  validateRequest
} from '../../middleware';
import { body, param } from 'express-validator';
import { createFolder, deleteFolder } from '../../controllers/v1/secretsFolderController';
import { ADMIN, MEMBER } from '../../variables';

router.post(
  '/',
  requireAuth({
    acceptedAuthModes: ['jwt']
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: 'body'
  }),
  body('workspaceId').exists(),
  body('environment').exists(),
  body('folderName').exists(),
  body('parentFolderId'),
  validateRequest,
  createFolder
);

router.delete(
  '/:folderId',
  requireAuth({
    acceptedAuthModes: ['jwt']
  }),
  param('folderId').exists(),
  validateRequest,
  deleteFolder
);


export default router;