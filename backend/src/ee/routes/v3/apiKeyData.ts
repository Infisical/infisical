import express from "express";
const router = express.Router();
import { requireAuth } from "../../../middleware";
import { AuthMode } from "../../../variables";
import { apiKeyDataController } from "../../controllers/v3";

router.post(
    "/",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT]
    }),
    apiKeyDataController.createAPIKeyData
);

router.patch(
    "/:apiKeyDataId",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT]
    }),
    apiKeyDataController.updateAPIKeyData
);

router.delete(
    "/:apiKeyDataId",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT]
    }),
    apiKeyDataController.deleteAPIKeyData
);

export default router;