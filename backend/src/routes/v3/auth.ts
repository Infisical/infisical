import express from "express";
import { body } from "express-validator";
import { validateRequest } from "../../middleware";
import { authController } from "../../controllers/v3";
import { authLimiter } from "../../helpers/rateLimiter";

const router = express.Router();

router.post(
    "/login1",
    authLimiter,
    body("email").isString().trim().toLowerCase(),
    body("providerAuthToken").isString().trim().optional({nullable: true}),
    body("clientPublicKey").isString().trim().notEmpty(),
    validateRequest,
    authController.login1
);

router.post(
    "/login2",
    authLimiter,
    body("email").isString().trim().toLowerCase(),
    body("providerAuthToken").isString().trim().optional({nullable: true}),
    body("clientProof").isString().trim().notEmpty(),
    validateRequest,
    authController.login2
);

export default router;
