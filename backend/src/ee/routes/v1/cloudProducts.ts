import express from "express";
const router = express.Router();
import {
    requireAuth,
    validateRequest,
} from "../../../middleware";
import { query } from "express-validator";
import { cloudProductsController } from "../../controllers/v1";

router.get(
    "/",
    requireAuth({
		acceptedAuthModes: ["jwt", "apiKey"],
	}),
    query("billing-cycle").exists().isIn(["monthly", "yearly"]),
    validateRequest,
    cloudProductsController.getCloudProducts 
);

export default router;