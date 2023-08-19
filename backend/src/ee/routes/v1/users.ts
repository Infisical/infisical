import express from "express";
const router = express.Router();
import {
    requireAuth
} from "../../../middleware";
import { AuthMode } from "../../../variables";
import { usersController } from "../../controllers/v1";

router.get(
    "/me/ip",
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
    }),
    usersController.getMyIp
);

export default router;