import express from "express";
const router = express.Router();
import passport from "passport";
import { requireAuth } from "@app/middleware";
import { ssoController } from "@app/ee/controllers/v1";
import { authLimiter } from "@app/helpers/rateLimiter";
import { AuthMode } from "@app/variables";

router.get("/redirect/google", authLimiter, (req, res, next) => {
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    ...(req.query.callback_port
      ? {
          state: req.query.callback_port as string
        }
      : {})
  })(req, res, next);
});

router.get(
  "/google",
  passport.authenticate("google", {
    failureRedirect: "/login/provider/error",
    session: false
  }),
  ssoController.redirectSSO
);

router.get("/redirect/github", authLimiter, (req, res, next) => {
  passport.authenticate("github", {
    session: false,
    ...(req.query.callback_port
      ? {
          state: req.query.callback_port as string
        }
      : {})
  })(req, res, next);
});

router.get(
  "/github",
  authLimiter,
  passport.authenticate("github", {
    failureRedirect: "/login/provider/error",
    session: false
  }),
  ssoController.redirectSSO
);

router.get("/redirect/saml2/:ssoIdentifier", authLimiter, (req, res, next) => {
  const options = {
    failureRedirect: "/",
    additionalParams: {
      RelayState: req.query.callback_port ?? ""
    }
  };
  passport.authenticate("saml", options)(req, res, next);
});

router.post(
  "/saml2/:ssoIdentifier",
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
    acceptedAuthModes: [AuthMode.JWT]
  }),
  ssoController.getSSOConfig
);

router.post(
  "/config",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  ssoController.createSSOConfig
);

router.patch(
  "/config",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  ssoController.updateSSOConfig
);

export default router;
