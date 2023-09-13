import express from "express";
const router = express.Router();
import { requireAuth, validateRequest } from "@app/middleware";
import { cloudProductsController } from "@app/ee/controllers/v1";
import { AuthMode } from "@app/variables";

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  validateRequest,
  cloudProductsController.getCloudProducts
);

export default router;
