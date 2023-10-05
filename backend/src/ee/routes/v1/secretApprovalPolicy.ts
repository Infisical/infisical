import express from "express";
const router = express.Router();
import { requireAuth } from "../../../middleware";
import { secretApprovalPolicyController } from "../../controllers/v1";
import { AuthMode } from "../../../variables";

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalPolicyController.getSecretApprovalPolicy
);

router.get(
  "/board",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalPolicyController.getSecretApprovalPolicyOfBoard
);

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalPolicyController.createSecretApprovalPolicy
);

router.patch(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalPolicyController.updateSecretApprovalPolicy
);

router.delete(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalPolicyController.deleteSecretApprovalPolicy
);

export default router;
