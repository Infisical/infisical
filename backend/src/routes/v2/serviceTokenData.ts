import express from "express";
const router = express.Router();
import {
  requireAuth
} from "../../middleware";
import { AuthMode } from "../../variables";
import { serviceTokenDataController } from "../../controllers/v2";

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
