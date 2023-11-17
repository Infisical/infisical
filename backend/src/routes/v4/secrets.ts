import express from "express";
const router = express.Router();
import { requireAuth} from "../../middleware";
import { secretsController } from "../../controllers/v4";

router.get(
    "/",
    requireAuth({
        acceptedAuthModes: []
    }),
    secretsController.getSecrets
);
  
router.get(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: []
    }),
    secretsController.getSecret
);
  
router.post(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: []
    }),
    secretsController.createSecret
);
  
router.patch(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: []
    }),
    secretsController.updateSecret
);
  
router.delete(
    "/:secretName",
    requireAuth({
        acceptedAuthModes: []
    }),
    secretsController.deleteSecret
);

export default router;