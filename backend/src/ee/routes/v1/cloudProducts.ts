import express from "express";
const router = express.Router();
import { requireAuth, validateRequest } from "../../../middleware";
import { cloudProductsController } from "../../controllers/v1";
import { AuthMode } from "../../../variables";

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  validateRequest,
  cloudProductsController.getCloudProducts
);

export default router;
