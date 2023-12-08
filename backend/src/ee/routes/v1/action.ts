import express from "express";
const router = express.Router();
import { actionController } from "../../controllers/v1";

// TODO: put into action controller
router.get("/:actionId", actionController.getAction);

export default router;
