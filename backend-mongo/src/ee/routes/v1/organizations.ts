import express from "express";
const router = express.Router();
import { requireAuth } from "../../../middleware";
import { organizationsController } from "../../controllers/v1";
import { AuthMode } from "../../../variables";

router.get(
  "/:organizationId/plans/table",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.getOrganizationPlansTable
);

router.get(
  "/:organizationId/plan",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.getOrganizationPlan
);

router.post(
  "/:organizationId/session/trial",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.startOrganizationTrial
);

router.get(
  "/:organizationId/plan/billing",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.getOrganizationPlanBillingInfo
);

router.get(
  "/:organizationId/plan/table",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.getOrganizationPlanTable
);

router.get(
  "/:organizationId/billing-details",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.getOrganizationBillingDetails
);

router.patch(
  "/:organizationId/billing-details",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.updateOrganizationBillingDetails
);

router.get(
  "/:organizationId/billing-details/payment-methods",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.getOrganizationPmtMethods
);

router.post(
  "/:organizationId/billing-details/payment-methods",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.addOrganizationPmtMethod
);

router.delete(
  "/:organizationId/billing-details/payment-methods/:pmtMethodId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.deleteOrganizationPmtMethod
);

router.get(
  "/:organizationId/billing-details/tax-ids",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.getOrganizationTaxIds
);

router.post(
  "/:organizationId/billing-details/tax-ids",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.addOrganizationTaxId
);

router.delete(
  "/:organizationId/billing-details/tax-ids/:taxId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.deleteOrganizationTaxId
);

router.get(
  "/:organizationId/invoices",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.getOrganizationInvoices
);

router.get(
  "/:organizationId/licenses",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.getOrganizationLicenses
);

export default router;
