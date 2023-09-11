import express from "express";
const router = express.Router();
import { requireAuth } from "../../../middleware";
import { AuthMode } from "../../../variables";
import { secretSnapshotController } from "../../controllers/v1";

router.get(
  "/:secretSnapshotId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretSnapshotController.getSecretSnapshot
);

export default router;
