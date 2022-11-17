import express from 'express';
const router = express.Router();
import { stripeController } from '../controllers';

router.post('/webhook', stripeController.handleWebhook);

export default router;