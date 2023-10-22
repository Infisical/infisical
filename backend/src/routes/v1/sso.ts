import express from "express";
const router = express.Router();
import passport from "passport";
import { authLimiter } from "../../helpers/rateLimiter";
import { ssoController } from "../../ee/controllers/v1";

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

router.get(
    "/redirect/gitlab",
    authLimiter,
    (req, res, next) => {
        passport.authenticate("gitlab", {
        session: false,
            ...(req.query.callback_port ? {
            state: req.query.callback_port as string
            } : {})
        })(req, res, next);
    }
);
  
router.get(
    "/gitlab",
    authLimiter,
    passport.authenticate("gitlab", {
      failureRedirect: "/login/provider/error",
      session: false
    }),
    ssoController.redirectSSO
);

export default router;