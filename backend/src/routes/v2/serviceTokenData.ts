import express from "express";
const router = express.Router();
import {
  requireAuth
} from "../../middleware";
import { AuthMode } from "../../variables";
import { serviceTokenDataController } from "../../controllers/v2";

router.get( // TODO: deprecate (moving to ST V3)
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.SERVICE_TOKEN]
  }),
  serviceTokenDataController.getServiceTokenData
);

router.post( // TODO: deprecate (moving to ST V3)
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  serviceTokenDataController.createServiceTokenData
);

router.delete( // TODO: deprecate (moving to ST V3)
  "/:serviceTokenDataId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  serviceTokenDataController.deleteServiceTokenData
);

export default router;