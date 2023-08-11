import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { userController } from "../../controllers/v1";
import { AuthMode } from "../../variables";

router.get( // TODO endpoint: deprecate (moved to v2/users/me)
    "/", 
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT],
    }), 
    userController.getUser
);

export default router;
