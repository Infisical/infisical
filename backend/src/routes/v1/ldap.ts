import express from "express";
const router = express.Router();
import passport from "passport";
import { requireAuth } from "../../middleware";
import { ldapController } from "../../controllers/v1";
import { AuthMode } from "../../variables";

router.post(
    "/login",
    passport.authenticate("ldapauth", {
        session: false
    }) as any,
    ldapController.redirectLDAP
);

router.get(
  "/config",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  ldapController.getLDAPConfig
);

router.post(
  "/config",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  ldapController.createLDAPConfig
);

router.patch(
  "/config",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  ldapController.updateLDAPConfig
);


export default router;