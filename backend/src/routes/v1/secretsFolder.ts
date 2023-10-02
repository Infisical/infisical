import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import {
  createFolder,
  deleteFolder,
  getFolders,
  updateFolderById
} from "../../controllers/v1/secretsFolderController";
import { AuthMode } from "../../variables";

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  createFolder
);

router.patch(
  "/:folderName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  updateFolderById
);

router.delete(
  "/:folderName",
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
