import express from "express";
import { authController } from "@app/controllers/v3";
import { authLimiter } from "@app/helpers/rateLimiter";

const router = express.Router();

router.post("/login1", authLimiter, authController.login1);

router.post("/login2", authLimiter, authController.login2);

export default router;
