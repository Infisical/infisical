import express from "express";
const router = express.Router();
import {
    requireAuth,
    requireWorkspaceAuth,
    validateRequest,
} from "../../middleware";
import { workspacesController } from "../../controllers/v3";
import {
    ADMIN,
    AuthMode
} from "../../variables";
import { body, param } from "express-validator";

// -- migration to blind indices endpoints

router.get(
    "/:workspaceId/secrets/blind-index-status",
    param("workspaceId").exists().isString().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT],
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN],
        locationWorkspaceId: "params",
    }),
    workspacesController.getWorkspaceBlindIndexStatus
);

router.get( // allow admins to get all workspace secrets (part of blind indices migration)
    "/:workspaceId/secrets",
    param("workspaceId").exists().isString().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT],
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN],
        locationWorkspaceId: "params",
    }),
    workspacesController.getWorkspaceSecrets
);

router.post( // allow admins to name all workspace secrets (part of blind indices migration)
    "/:workspaceId/secrets/names",
    param("workspaceId").exists().isString().trim(),
    body("secretsToUpdate")
        .exists()
        .isArray()
        .withMessage("secretsToUpdate must be an array")
        .customSanitizer((value) => {
            return value.map((secret: any) => ({
                secretName: secret.secretName,
                _id: secret._id,
            }));
        }),
    body("secretsToUpdate.*.secretName")
        .exists()
        .isString()
        .withMessage("secretName must be a string"),
    body("secretsToUpdate.*._id")
        .exists()
        .isString()
        .withMessage("secretId must be a string"),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT],
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN],
        locationWorkspaceId: "params",
    }),
    workspacesController.nameWorkspaceSecrets
);

// --

export default router;