import express from "express";
import { authController } from "../../controllers/v3";
import { authLimiter } from "../../helpers/rateLimiter";

const router = express.Router();

router.post("/login1", authLimiter, authController.login1);

router.post("/login2", authLimiter, authController.login2);

export default router;
