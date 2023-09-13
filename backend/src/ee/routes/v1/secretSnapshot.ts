import express from "express";
const router = express.Router();
import { requireAuth } from "@app/middleware";
import { AuthMode } from "@app/variables";
import { secretSnapshotController } from "@app/ee/controllers/v1";

router.get(
  "/:secretSnapshotId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretSnapshotController.getSecretSnapshot
);

export default router;
