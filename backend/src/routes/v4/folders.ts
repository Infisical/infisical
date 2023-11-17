import express from "express";
const router = express.Router();
import { requireAuth} from "../../middleware";
// import { secretsController } from "../../controllers/v4";
import { AuthMode } from "../../variables";

router.post(
    "/",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
    }),
);

router.patch(
    ":/folderName",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
    }),
);

router.delete(
    "/:folderName",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
    }),
);

export default router;