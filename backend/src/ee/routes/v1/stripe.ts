import express from "express";
const router = express.Router();
import { stripeController } from "../../controllers/v1";

router.post("/webhook", stripeController.handleWebhook);

export default router;