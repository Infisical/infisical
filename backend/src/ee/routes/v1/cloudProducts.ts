import express from "express";
const router = express.Router();
import {
    requireAuth,
    validateRequest,
} from "../../../middleware";
import { query } from "express-validator";
import { cloudProductsController } from "../../controllers/v1";
import { AuthMode } from "../../../variables";

router.get(
    "/",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
	}),
    query("billing-cycle").exists().isIn(["monthly", "yearly"]),
    validateRequest,
    cloudProductsController.getCloudProducts 
);

export default router;