import express from "express";
const router = express.Router();
import { requireAuth, requireBlindIndicesEnabled, requireE2EEOff} from "../../middleware";
import { secretsController } from "../../controllers/v4";
import { AuthMode } from "../../variables";

router.get(
    "/",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY_V2, AuthMode.SERVICE_ACCESS_TOKEN]
    }),
    secretsController.getSecrets
);
  
router.get(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY_V2, AuthMode.SERVICE_ACCESS_TOKEN]
    }),
    requireBlindIndicesEnabled({
        locationWorkspaceId: "query"
    }),
    requireE2EEOff({
        locationWorkspaceId: "query"
    }),
    secretsController.getSecret
);
  
router.post(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY_V2, AuthMode.SERVICE_ACCESS_TOKEN]
    }),
    requireBlindIndicesEnabled({
        locationWorkspaceId: "body"
    }),
    requireE2EEOff({
        locationWorkspaceId: "body"
    }),
    secretsController.createSecret
);
  
router.patch(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY_V2, AuthMode.SERVICE_ACCESS_TOKEN]
    }),
    requireBlindIndicesEnabled({
        locationWorkspaceId: "body"
    }),
    requireE2EEOff({
        locationWorkspaceId: "body"
    }),
    secretsController.updateSecret
);
  
router.delete(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY_V2, AuthMode.SERVICE_ACCESS_TOKEN]
    }),
    requireBlindIndicesEnabled({
        locationWorkspaceId: "body"
    }),
    requireE2EEOff({
        locationWorkspaceId: "body"
    }),
    secretsController.deleteSecret
);

export default router;