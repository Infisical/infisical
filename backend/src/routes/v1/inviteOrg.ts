import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { requireAuth, validateRequest } from "../../middleware";
import { membershipOrgController } from "../../controllers/v1";
import { AuthMode } from "../../variables";

// TODO endpoint: consider moving these endpoints to be under /organization to be more RESTful

router.post(
  "/signup",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  membershipOrgController.inviteUserToOrganization
);

router.post(
  "/verify",
  body("email").exists().trim().notEmpty(),
  body("organizationId").exists().trim().notEmpty(),
  body("code").exists().trim().notEmpty(),
  validateRequest,
  membershipOrgController.verifyUserToOrganization
);

export default router;
