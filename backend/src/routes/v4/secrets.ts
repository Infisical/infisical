import express from "express";
const router = express.Router();
import { requireAuth} from "../../middleware";
import { secretsController } from "../../controllers/v4";
import { AuthMode } from "../../variables";

router.get(
    "/",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY_V2, AuthMode.SERVICE_ACCESS_TOKEN, AuthMode.SERVICE_TOKEN]
    }),
    secretsController.getSecrets
);
  
router.get(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY_V2, AuthMode.SERVICE_ACCESS_TOKEN, AuthMode.SERVICE_TOKEN]
    }),
    secretsController.getSecret
);
  
router.post(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY_V2, AuthMode.SERVICE_ACCESS_TOKEN, AuthMode.SERVICE_TOKEN]
    }),
    secretsController.createSecret
);
  
router.patch(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY_V2, AuthMode.SERVICE_ACCESS_TOKEN, AuthMode.SERVICE_TOKEN]
    }),
    secretsController.updateSecret
);
  
router.delete(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY_V2, AuthMode.SERVICE_ACCESS_TOKEN, AuthMode.SERVICE_TOKEN]
    }),
    secretsController.deleteSecret
);

export default router;