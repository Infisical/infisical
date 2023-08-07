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
    ACCEPTED, ADMIN, AuthMode, MEMBER, OWNER
} from "../../../variables";

router.get(
    "/:organizationId/plans/table",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    query("billingCycle").exists().isString().isIn(["monthly", "yearly"]),
    validateRequest,
    organizationsController.getOrganizationPlansTable
);

router.get(
    "/:organizationId/plan",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
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

router.post(
    "/:organizationId/session/trial",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    body("success_url").exists().trim(),
    validateRequest,
    organizationsController.startOrganizationTrial
);

router.get(
    "/:organizationId/plan/billing",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    query("workspaceId").optional().isString(),
    validateRequest,
    organizationsController.getOrganizationPlanBillingInfo
);

router.get(
    "/:organizationId/plan/table",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    query("workspaceId").optional().isString(),
    validateRequest,
    organizationsController.getOrganizationPlanTable
);

router.get(
    "/:organizationId/billing-details",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    validateRequest,
    organizationsController.getOrganizationBillingDetails
);

router.patch(
    "/:organizationId/billing-details",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    body("email").optional().isString().trim(),
    body("name").optional().isString().trim(),
    validateRequest,
    organizationsController.updateOrganizationBillingDetails
);

router.get(
    "/:organizationId/billing-details/payment-methods",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
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
		acceptedAuthModes: [AuthMode.JWT],
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
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    param("pmtMethodId").exists().trim(),
    validateRequest,
    organizationsController.deleteOrganizationPmtMethod
);

router.get(
    "/:organizationId/billing-details/tax-ids",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    validateRequest,
    organizationsController.getOrganizationTaxIds
);

router.post(
    "/:organizationId/billing-details/tax-ids",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    body("type").exists().isString(),
    body("value").exists().isString(),
    validateRequest,
    organizationsController.addOrganizationTaxId
);

router.delete(
    "/:organizationId/billing-details/tax-ids/:taxId",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    param("taxId").exists().trim(),
    validateRequest,
    organizationsController.deleteOrganizationTaxId
);

router.get(
    "/:organizationId/invoices",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    validateRequest,
    organizationsController.getOrganizationInvoices
);

router.get(
    "/:organizationId/licenses",
    requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED],
    }),
    param("organizationId").exists().trim(),
    validateRequest,
    organizationsController.getOrganizationLicenses
);

export default router;