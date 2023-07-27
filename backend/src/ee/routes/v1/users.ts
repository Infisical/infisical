import express from "express";
const router = express.Router();
import {
    requireAuth
} from "../../../middleware";
import { AUTH_MODE_API_KEY, AUTH_MODE_JWT } from "../../../variables";
import { usersController } from "../../controllers/v1";

router.get(
    "/me/ip",
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY],
    }),
    usersController.getMyIp
);

export default router;