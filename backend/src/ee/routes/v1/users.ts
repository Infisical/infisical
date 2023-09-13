import express from "express";
const router = express.Router();
import { requireAuth } from "@app/middleware";
import { AuthMode } from "@app/variables";
import { usersController } from "@app/ee/controllers/v1";

router.get(
  "/me/ip",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  usersController.getMyIp
);

export default router;
