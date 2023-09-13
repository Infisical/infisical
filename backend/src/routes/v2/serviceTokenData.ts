import express from "express";
const router = express.Router();
import { requireAuth } from "@app/middleware";
import { AuthMode } from "@app/variables";
import { serviceTokenDataController } from "@app/controllers/v2";

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.SERVICE_TOKEN]
  }),
  serviceTokenDataController.getServiceTokenData
);

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  serviceTokenDataController.createServiceTokenData
);

router.delete(
  "/:serviceTokenDataId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  serviceTokenDataController.deleteServiceTokenData
);

export default router;
