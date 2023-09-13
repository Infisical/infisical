import express from "express";
const router = express.Router();
import { requireAuth } from "@app/middleware";
import { userController } from "@app/controllers/v1";
import { AuthMode } from "@app/variables";

router.get(
  // TODO endpoint: deprecate (moved to v2/users/me)
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  userController.getUser
);

export default router;
