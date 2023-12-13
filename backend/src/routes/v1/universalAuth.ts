
import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { universalAuthController } from "../../controllers/v1";
import { AuthMode } from "../../variables";

router.post(
    "/token/renew", 
    universalAuthController.renewAccessToken
);

router.post(
    "/universal-auth/login",
    universalAuthController.loginIdentityUniversalAuth
);

router.post(
    "/universal-auth/identities/:identityId",
    requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]
    }),
    universalAuthController.attachIdentityUniversalAuth
);

router.patch(
    "/universal-auth/identities/:identityId",
    requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]
    }),
    universalAuthController.updateIdentityUniversalAuth
);

router.get(
    "/universal-auth/identities/:identityId",
    requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]
    }),
    universalAuthController.getIdentityUniversalAuth
);

router.post(
    "/universal-auth/identities/:identityId/client-secrets",
    requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]
    }),
    universalAuthController.createUniversalAuthClientSecret
);

router.get(
    "/universal-auth/identities/:identityId/client-secrets",
    requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]
    }),
    universalAuthController.getUniversalAuthClientSecretsDetails
);

router.post(
    "/universal-auth/identities/:identityId/client-secrets/:clientSecretId/revoke",
    requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]
    }),
    universalAuthController.revokeUniversalAuthClientSecret
);

export default router;