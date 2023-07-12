import express from "express";
const router = express.Router();
import {
    requireAuth,
    requireOrganizationAuth,
    validateRequest,
} from "../../../middleware";
import { body, param, query } from "express-validator";
import { organizationsController } from "../../controllers/v1";
import {
    ACCEPTED, ADMIN, MEMBER, OWNER,
} from "../../../variables";

router.get(
    "/:organizationId/plan",
    requireAuth({
		acceptedAuthModes: ["jwt", "apiKey"],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    query("workspaceId").optional().isString(),
    validateRequest,
    organizationsController.getOrganizationPlan
);

router.patch(
    "/:organizationId/plan",
    requireAuth({
		acceptedAuthModes: ["jwt", "apiKey"],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    body("productId").exists().isString(),
    validateRequest,
    organizationsController.updateOrganizationPlan
);

router.get(
    "/:organizationId/billing-details/payment-methods",
    requireAuth({
		acceptedAuthModes: ["jwt", "apiKey"],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    validateRequest,
    organizationsController.getOrganizationPmtMethods
);

router.post(
    "/:organizationId/billing-details/payment-methods",
    requireAuth({
		acceptedAuthModes: ["jwt", "apiKey"],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    body("success_url").exists().isString(),
    body("cancel_url").exists().isString(),
    validateRequest,
    organizationsController.addOrganizationPmtMethod
);

router.delete(
    "/:organizationId/billing-details/payment-methods/:pmtMethodId",
    requireAuth({
		acceptedAuthModes: ["jwt", "apiKey"],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    validateRequest,
    organizationsController.deleteOrganizationPmtMethod
);

export default router;