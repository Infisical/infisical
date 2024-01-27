import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { userActionController } from "../../controllers/v1";
import { AuthMode } from "../../variables";

// note: [userAction] will be deprecated in /v2 in favor of [action]
router.post(
  // TODO endpoint: move this into /users/me
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  userActionController.addUserAction
);

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  userActionController.getUserAction
);

export default router;
