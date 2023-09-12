import { Types } from "mongoose";
import { Request, Response } from "express";
import { getLicenseServerUrl } from "../../../config";
import { licenseServerKeyRequest } from "../../../config/request";
import { EELicenseService } from "../../services";
import { validateRequest } from "../../../helpers/validation";
import * as reqValidator from "../../../validation/organization";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  getUserOrgPermissions
} from "../../services/RoleService";
import { ForbiddenError } from "@casl/ability";
import { Organization } from "../../../models";
import { OrganizationNotFoundError } from "../../../utils/errors";

export const getOrganizationPlansTable = async (req: Request, res: Response) => {
  const {
    query: { billingCycle },
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgPlansTablev1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Billing
  );

  const { data } = await licenseServerKeyRequest.get(
    `${await getLicenseServerUrl()}/api/license-server/v1/cloud-products?billing-cycle=${billingCycle}`
  );

  return res.status(200).send(data);
};

/**
 * Return the organization current plan's feature set
 */
export const getOrganizationPlan = async (req: Request, res: Response) => {
  const {
    query: { workspaceId },
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgPlanv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Billing
  );

  const plan = await EELicenseService.getPlan(
    new Types.ObjectId(organizationId),
    new Types.ObjectId(workspaceId)
  );

  return res.status(200).send({
    plan
  });
};

/**
 * Return checkout url for pro trial
 * @param req
 * @param res
 * @returns
 */
export const startOrganizationTrial = async (req: Request, res: Response) => {
  const {
    params: { organizationId },
    body: { success_url }
  } = await validateRequest(reqValidator.StartOrgTrailv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.Billing
  );
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Edit,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const {
    data: { url }
  } = await licenseServerKeyRequest.post(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/session/trial`,
    {
      success_url
    }
  );

  EELicenseService.delPlan(new Types.ObjectId(organizationId));

  return res.status(200).send({
    url
  });
};

/**
 * Return the organization's current plan's billing info
 * @param req
 * @param res
 * @returns
 */
export const getOrganizationPlanBillingInfo = async (req: Request, res: Response) => {
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgPlanBillingInfov1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const { data } = await licenseServerKeyRequest.get(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/cloud-plan/billing`
  );

  return res.status(200).send(data);
};

/**
 * Return the organization's current plan's feature table
 * @param req
 * @param res
 * @returns
 */
export const getOrganizationPlanTable = async (req: Request, res: Response) => {
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgPlanTablev1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const { data } = await licenseServerKeyRequest.get(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/cloud-plan/table`
  );

  return res.status(200).send(data);
};

export const getOrganizationBillingDetails = async (req: Request, res: Response) => {
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgBillingDetailsv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const { data } = await licenseServerKeyRequest.get(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/billing-details`
  );

  return res.status(200).send(data);
};

export const updateOrganizationBillingDetails = async (req: Request, res: Response) => {
  const {
    params: { organizationId },
    body: { name, email }
  } = await validateRequest(reqValidator.UpdateOrgBillingDetailsv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Edit,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const { data } = await licenseServerKeyRequest.patch(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/billing-details`,
    {
      ...(name ? { name } : {}),
      ...(email ? { email } : {})
    }
  );

  return res.status(200).send(data);
};

/**
 * Return the organization's payment methods on file
 */
export const getOrganizationPmtMethods = async (req: Request, res: Response) => {
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgPmtMethodsv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const {
    data: { pmtMethods }
  } = await licenseServerKeyRequest.get(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/billing-details/payment-methods`
  );

  return res.status(200).send(pmtMethods);
};

/**
 * Return URL to add payment method for organization
 */
export const addOrganizationPmtMethod = async (req: Request, res: Response) => {
  const {
    params: { organizationId },
    body: { success_url, cancel_url }
  } = await validateRequest(reqValidator.CreateOrgPmtMethodv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const {
    data: { url }
  } = await licenseServerKeyRequest.post(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/billing-details/payment-methods`,
    {
      success_url,
      cancel_url
    }
  );

  return res.status(200).send({
    url
  });
};

/**
 * Delete payment method with id [pmtMethodId] for organization
 * @param req
 * @param res
 * @returns
 */
export const deleteOrganizationPmtMethod = async (req: Request, res: Response) => {
  const {
    params: { organizationId, pmtMethodId }
  } = await validateRequest(reqValidator.DelOrgPmtMethodv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Delete,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const { data } = await licenseServerKeyRequest.delete(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/billing-details/payment-methods/${pmtMethodId}`
  );

  return res.status(200).send(data);
};

/**
 * Return the organization's tax ids on file
 */
export const getOrganizationTaxIds = async (req: Request, res: Response) => {
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgTaxIdsv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const {
    data: { tax_ids }
  } = await licenseServerKeyRequest.get(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/billing-details/tax-ids`
  );

  return res.status(200).send(tax_ids);
};

/**
 * Add tax id to organization
 */
export const addOrganizationTaxId = async (req: Request, res: Response) => {
  const {
    params: { organizationId },
    body: { type, value }
  } = await validateRequest(reqValidator.CreateOrgTaxId, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const { data } = await licenseServerKeyRequest.post(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/billing-details/tax-ids`,
    {
      type,
      value
    }
  );

  return res.status(200).send(data);
};

/**
 * Delete tax id with id [taxId] from organization tax ids on file
 * @param req
 * @param res
 * @returns
 */
export const deleteOrganizationTaxId = async (req: Request, res: Response) => {
  const {
    params: { organizationId, taxId }
  } = await validateRequest(reqValidator.DelOrgTaxIdv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Delete,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const { data } = await licenseServerKeyRequest.delete(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/billing-details/tax-ids/${taxId}`
  );

  return res.status(200).send(data);
};

/**
 * Return organization's invoices on file
 * @param req
 * @param res
 * @returns
 */
export const getOrganizationInvoices = async (req: Request, res: Response) => {
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgInvoicesv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const {
    data: { invoices }
  } = await licenseServerKeyRequest.get(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/invoices`
  );

  return res.status(200).send(invoices);
};

/**
 * Return organization's licenses on file
 * @param req
 * @param res
 * @returns
 */
export const getOrganizationLicenses = async (req: Request, res: Response) => {
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgLicencesv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Billing
  );

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const {
    data: { licenses }
  } = await licenseServerKeyRequest.get(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${
      organization.customerId
    }/licenses`
  );

  return res.status(200).send(licenses);
};
