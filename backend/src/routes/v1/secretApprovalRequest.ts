import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { secretApprovalRequestController } from "../../controllers/v1";
import { AuthMode } from "../../variables";

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalRequestController.getSecretApprovalRequests
);

router.get(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalRequestController.getSecretApprovalRequestDetails
);

router.post(
  "/merge",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalRequestController.mergeSecretApprovalRequest
);

router.post(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalRequestController.updateSecretApprovalRequestStatus
);

export default router;
