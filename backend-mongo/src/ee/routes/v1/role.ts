import express from "express";
import { roleController } from "../../controllers/v1";
import { requireAuth } from "../../../middleware";
import { AuthMode } from "../../../variables";

const router = express.Router();

router.post("/", requireAuth({ acceptedAuthModes: [AuthMode.JWT] }), roleController.createRole);

router.patch("/:id", requireAuth({ acceptedAuthModes: [AuthMode.JWT] }), roleController.updateRole);

router.delete(
  "/:id",
  requireAuth({ acceptedAuthModes: [AuthMode.JWT] }),
  roleController.deleteRole
);

router.get("/", requireAuth({ acceptedAuthModes: [AuthMode.JWT] }), roleController.getRoles);

// get a user permissions in an org
router.get(
  "/organization/:orgId/permissions",
  requireAuth({ acceptedAuthModes: [AuthMode.JWT] }),
  roleController.getUserPermissions
);

router.get(
  "/workspace/:workspaceId/permissions",
  requireAuth({ acceptedAuthModes: [AuthMode.JWT] }),
  roleController.getUserWorkspacePermissions
);

export default router;
