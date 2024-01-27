import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";
import { usersController } from "../../controllers/v3";

router.get(
  "/me/api-keys",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  usersController.getMyAPIKeys
);

export default router;