import express from "express";
const router = express.Router();
import { requireAuth } from "../../../middleware";
import { AuthMode } from "../../../variables";
import { identitiesController } from "../../controllers/v1";

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]
  }),
  identitiesController.createIdentity
);

router.patch(
  "/:identityId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  identitiesController.updateIdentity
);

router.delete(
  "/:identityId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  identitiesController.deleteIdentity
);

export default router;