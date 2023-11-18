import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { environmentsController } from "../../controllers/v4";
// import { AuthMode } from "../../variables";

router.post(
    "/",
    requireAuth({
        acceptedAuthModes: []
    }),
    environmentsController.createEnvironment
);

router.get(
    "/",
    requireAuth({
        acceptedAuthModes: []
    }),
    environmentsController.getEnvironments
);

router.patch(
    "/:environmentSlug",
    requireAuth({
        acceptedAuthModes: []
    }),
    environmentsController.updateEnvironment
);

router.delete(
    "/:environmentSlug",
    requireAuth({
        acceptedAuthModes: []
    }),
    environmentsController.deleteEnvironment
)

export default router;