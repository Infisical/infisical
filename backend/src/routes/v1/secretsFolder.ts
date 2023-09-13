import express from "express";
import {
  createFolder,
  deleteFolder,
  getFolders,
  updateFolderById
} from "@app/controllers/v1/secretsFolderController";
import { requireAuth } from "@app/middleware";
import { AuthMode } from "@app/variables";
const router = express.Router();

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  createFolder
);

router.patch(
  "/:folderId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  updateFolderById
);

router.delete(
  "/:folderId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  deleteFolder
);

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  getFolders
);

export default router;
