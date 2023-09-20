import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";
import { serviceTokenDataController } from "../../controllers/v3";

router.post(
    "/",
    requireAuth({
      acceptedAuthModes: [AuthMode.JWT]
    }),
    serviceTokenDataController.createServiceTokenData
);

router.patch(
    "/:serviceTokenDataId",
    requireAuth({
      acceptedAuthModes: [AuthMode.JWT]
    }),
    serviceTokenDataController.updateServiceTokenData
);

router.delete(
  "/:serviceTokenDataId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  serviceTokenDataController.deleteServiceTokenData
);

export default router;