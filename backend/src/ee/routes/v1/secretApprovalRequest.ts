import express from "express";
const router = express.Router();
import { requireAuth } from "../../../middleware";
import { secretApprovalRequestController } from "../../controllers/v1";
import { AuthMode } from "../../../variables";

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalRequestController.getSecretApprovalRequests
);

router.get(
  "/count",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalRequestController.getSecretApprovalRequestCount
);

router.get(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalRequestController.getSecretApprovalRequestDetails
);

router.post(
  "/:id/merge",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalRequestController.mergeSecretApprovalRequest
);

router.post(
  "/:id/review",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalRequestController.updateSecretApprovalReviewStatus
);

router.post(
  "/:id/status",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretApprovalRequestController.updateSecretApprovalRequestStatus
);

export default router;
