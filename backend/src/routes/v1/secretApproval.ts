import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { secretApprovalController } from "../../controllers/v1";
import { AuthMode } from "../../variables";

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalController.getSecretApprovalRules
);

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalController.createSecretApprovalRule
);

router.patch(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalController.updateSecretApprovalRule
);

router.delete(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalController.deleteSecretApprovalRule
);

export default router;
