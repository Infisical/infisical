import express from "express";
const router = express.Router();
import passport from "passport";
import {
    requireAuth,
    requireOrganizationAuth,
    validateRequest,
} from "../../../middleware";
import { body, query } from "express-validator";
import { ssoController } from "../../controllers/v1";
import { authLimiter } from "../../../helpers/rateLimiter";
import {
    ACCEPTED,
    OWNER,
    ADMIN
} from "../../../variables";

router.get(
  "/redirect/google",
  authLimiter,
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

router.get(
  "/google",
  passport.authenticate("google", { 
    failureRedirect: "/login/provider/error", 
    session: false 
  }),
  ssoController.redirectSSO
);

router.get(
  "/redirect/saml2/:ssoIdentifier",
  authLimiter,
  passport.authenticate("saml", {
    failureRedirect: "/login/fail"
  })
);

router.post("/saml2/:ssoIdentifier",
  passport.authenticate("saml", { 
    failureRedirect: "/login/provider/error", 
    failureFlash: true, 
    session: false 
  }),
  ssoController.redirectSSO
);

router.get(
    "/config",
    requireAuth({
		acceptedAuthModes: ["jwt"],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED],
        locationOrganizationId: "query"
    }),
    query("organizationId").exists().trim(),
    validateRequest,
    ssoController.getSSOConfig
);

router.post(
    "/config",
    requireAuth({
		acceptedAuthModes: ["jwt"],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED],
        locationOrganizationId: "body"
    }),
    body("organizationId").exists().trim(),
    body("authProvider").exists().isString(),
    body("isActive").exists().isBoolean(),
    body("entryPoint").exists().isString(),
    body("issuer").exists().isString(),
    body("cert").exists().isString(),
    body("audience").exists().isString(),
    validateRequest,
    ssoController.createSSOConfig
);

router.patch(
    "/config",
    requireAuth({
		acceptedAuthModes: ["jwt"],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED],
        locationOrganizationId: "body"
    }),
    body("organizationId").exists().trim(),
    body("authProvider").optional().isString(),
    body("isActive").optional().isBoolean(),
    body("entryPoint").optional().isString(),
    body("issuer").optional().isString(),
    body("cert").optional().isString(),
    body("audience").optional().isString(),
    validateRequest,
    ssoController.updateSSOConfig
);

export default router;