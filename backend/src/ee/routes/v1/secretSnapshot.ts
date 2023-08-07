import express from "express";
const router = express.Router();
import {
    requireSecretSnapshotAuth,
} from "../../middleware";
import {
    requireAuth,
    validateRequest,
} from "../../../middleware";
import { param } from "express-validator";
import { ADMIN, AuthMode, MEMBER } from "../../../variables";
import { secretSnapshotController } from "../../controllers/v1";

router.get(
    "/:secretSnapshotId",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireSecretSnapshotAuth({
        acceptedRoles: [ADMIN, MEMBER],
    }),
    param("secretSnapshotId").exists().trim(),
    validateRequest,
    secretSnapshotController.getSecretSnapshot
);

export default router;