import express from "express";
const router = express.Router();
import passport from "passport";
import {
  AuthProvider
} from "../../models";
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
    ADMIN,
    OWNER
} from "../../../variables";

router.get(
  "/redirect/google",
  authLimiter,
  (req, res, next) => {
    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: false,
      ...(req.query.callback_port ? {
        state: req.query.callback_port as string
      } : {})
    })(req, res, next);
  }
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
  (req, res, next) => {
    const options = {
        failureRedirect: "/",
        additionalParams: {
          RelayState: req.query.callback_port ?? ""
        },
    };
    passport.authenticate("saml", options)(req, res, next);
  }
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
    body("authProvider").exists().isString().isIn([AuthProvider.OKTA_SAML]),
    body("isActive").exists().isBoolean(),
    body("entryPoint").exists().isString(),
    body("issuer").exists().isString(),
    body("cert").exists().isString(),
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
    validateRequest,
    ssoController.updateSSOConfig
);

export default router;