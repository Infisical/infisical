import express from "express";
import { roleController } from "../../controllers/v1";
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";

const router = express.Router();

router.post("/", requireAuth({ acceptedAuthModes: [AuthMode.JWT] }), roleController.createRole);

router.patch("/:id", requireAuth({ acceptedAuthModes: [AuthMode.JWT] }), roleController.updateRole);

router.delete(
  "/:id",
  requireAuth({ acceptedAuthModes: [AuthMode.JWT] }),
  roleController.deleteRole
);

router.get("/", requireAuth({ acceptedAuthModes: [AuthMode.JWT] }), roleController.getRoles);

export default router;
