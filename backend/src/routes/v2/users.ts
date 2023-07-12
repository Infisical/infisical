import express from "express";
const router = express.Router();
import {
    requireAuth,
    validateRequest,
} from "../../middleware";
import { body, param } from "express-validator";
import { usersController } from "../../controllers/v2";
import {
    AUTH_MODE_API_KEY,
    AUTH_MODE_JWT,
} from "../../variables";

router.get(
    "/me",
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY],
    }),
    usersController.getMe
);

router.patch(
    "/me/mfa",
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY],
    }),
    body("isMfaEnabled").exists().isBoolean(),
    validateRequest,
    usersController.updateMyMfaEnabled
);

router.get(
    "/me/organizations",
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY],
    }),
    usersController.getMyOrganizations
);

router.get(
    "/me/api-keys",
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }),
    usersController.getMyAPIKeys
);

router.post(
    "/me/api-keys",
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }),
    body("name").exists().isString().trim(),
    body("expiresIn").isNumeric(),
    validateRequest,
    usersController.createAPIKey
);

router.delete(
    "/me/api-keys/:apiKeyDataId",
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }),
    param("apiKeyDataId").exists().trim(),
    validateRequest,
    usersController.deleteAPIKey
);

router.get( // new
    "/me/sessions",
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }), 
    usersController.getMySessions
);

router.delete( // new
    "/me/sessions",
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }), 
    usersController.deleteMySessions
);

export default router;