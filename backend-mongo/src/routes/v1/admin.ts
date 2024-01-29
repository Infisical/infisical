import express from "express";
import { adminController } from "../../controllers/v1";
const router = express.Router();
import { requireAuth, requireSuperAdminAccess } from "../../middleware";
import { AuthMode } from "../../variables";

router.get("/config", adminController.getServerConfigInfo);

router.post("/signup", adminController.adminSignUp);

router.patch(
  "/config",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  requireSuperAdminAccess,
  adminController.updateServerConfig
);

export default router;
