import express from "express";
import { body, param, query } from "express-validator";
import {
  createFolder,
  deleteFolder,
  getFolders,
  updateFolderById
} from "../../controllers/v1/secretsFolderController";
import { requireAuth, requireWorkspaceAuth, validateRequest } from "../../middleware";
import { ADMIN, AuthMode, MEMBER } from "../../variables";
const router = express.Router();

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT,AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body"
  }),
  body("workspaceId").exists(),
  body("environment").exists(),
  body("folderName").exists(),
  body("parentFolderId"),
  validateRequest,
  createFolder
);

router.patch(
  "/:folderId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT,AuthMode.SERVICE_TOKEN]
  }),
  body("workspaceId").exists(),
  body("environment").exists(),
  param("folderId").not().isIn(["root"]).exists(),
  validateRequest,
  updateFolderById
);

router.delete(
  "/:folderId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT,AuthMode.SERVICE_TOKEN]
  }),
  body("workspaceId").exists(),
  body("environment").exists(),
  param("folderId").not().isIn(["root"]).exists(),
  validateRequest,
  deleteFolder
);

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT,AuthMode.SERVICE_TOKEN]
  }),
  query("workspaceId").exists().isString().trim(),
  query("environment").exists().isString().trim(),
  query("parentFolderId").optional().isString().trim(),
  query("parentFolderPath").optional().isString().trim(),
  validateRequest,
  getFolders
);

export default router;
