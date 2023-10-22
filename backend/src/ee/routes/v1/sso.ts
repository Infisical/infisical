import express from "express";
const router = express.Router();
import passport from "passport";
import { requireAuth } from "../../../middleware";
import { ssoController } from "../../controllers/v1";
import { authLimiter } from "../../../helpers/rateLimiter";
import { AuthMode } from "../../../variables";

router.get(
  "/redirect/saml2/:ssoIdentifier",
  authLimiter,
  (req, res, next) => {
    const options = {
        failureRedirect: "/",
        additionalParams: {
          RelayState: JSON.stringify({
            spInitiated: true,
            callbackPort: req.query.callback_port ?? ""
          })
        },
    };
    passport.authenticate("saml", options)(req, res, next);
  }
);

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
