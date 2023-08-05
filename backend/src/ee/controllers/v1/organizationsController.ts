import { Types } from "mongoose";
import { Request, Response } from "express";
import { getLicenseServerUrl } from "../../../config";
import { licenseServerKeyRequest } from "../../../config/request";
import { EELicenseService } from "../../services";

export const getOrganizationPlansTable = async (req: Request, res: Response) => {
    const billingCycle = req.query.billingCycle as string;
    
    const { data } = await licenseServerKeyRequest.get(
        `${await getLicenseServerUrl()}/api/license-server/v1/cloud-products?billing-cycle=${billingCycle}`
    ); 

    return res.status(200).send(data); 
}

/**
 * Return the organization current plan's feature set
 */
export const getOrganizationPlan = async (req: Request, res: Response) => {
    const { organizationId } = req.params;
    const workspaceId = req.query.workspaceId as string;

    const plan = await EELicenseService.getPlan(new Types.ObjectId(organizationId), new Types.ObjectId(workspaceId));

    return res.status(200).send({
        plan,
    });
}

/**
 * Return checkout url for pro trial
 * @param req 
 * @param res 
 * @returns 
 */
export const startOrganizationTrial = async (req: Request, res: Response) => {
    const { organizationId } = req.params;
    const { success_url } = req.body;

    const { data: { url } } = await licenseServerKeyRequest.post(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/session/trial`,
        {
            success_url
        }
    ); 
    
    EELicenseService.delPlan(new Types.ObjectId(organizationId));
    
    return res.status(200).send({
        url
    });
}

/**
 * Return the organization's current plan's billing info
 * @param req 
 * @param res 
 * @returns 
 */
export const getOrganizationPlanBillingInfo = async (req: Request, res: Response) => {
    const { data } = await licenseServerKeyRequest.get(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/cloud-plan/billing`
    ); 
    
    return res.status(200).send(data);
}

/**
 * Return the organization's current plan's feature table
 * @param req 
 * @param res 
 * @returns 
 */
export const getOrganizationPlanTable = async (req: Request, res: Response) => {
    const { data } = await licenseServerKeyRequest.get(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/cloud-plan/table`
    ); 

    return res.status(200).send(data);
}

export const getOrganizationBillingDetails = async (req: Request, res: Response) => {
    const { data  } = await licenseServerKeyRequest.get(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details`
    ); 

    return res.status(200).send(data);
}

export const updateOrganizationBillingDetails = async (req: Request, res: Response) => {
    const {
        name,
        email
    } = req.body;

    const { data } = await licenseServerKeyRequest.patch(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details`,
        {
            ...(name ? { name } : {}),
            ...(email ? { email } : {})
        }
    ); 

    return res.status(200).send(data); 
}

/**
 * Return the organization's payment methods on file
 */
export const getOrganizationPmtMethods = async (req: Request, res: Response) => {
    const { data: { pmtMethods } } = await licenseServerKeyRequest.get(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details/payment-methods`
    );

    return res.status(200).send(pmtMethods); 
}

/**
 * Return URL to add payment method for organization
 */
export const addOrganizationPmtMethod = async (req: Request, res: Response) => {
    const {
        success_url,
        cancel_url,
    } = req.body;
    
    const { data: { url } } = await licenseServerKeyRequest.post(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details/payment-methods`,
        {
            success_url,
            cancel_url,
        }
    );
    
    return res.status(200).send({
        url,
    }); 
}

/**
 * Delete payment method with id [pmtMethodId] for organization
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteOrganizationPmtMethod = async (req: Request, res: Response) => {
    const { pmtMethodId } = req.params;

    const { data } = await licenseServerKeyRequest.delete(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details/payment-methods/${pmtMethodId}`,
    );
        
    return res.status(200).send(data);
}

/**
 * Return the organization's tax ids on file
 */
export const getOrganizationTaxIds = async (req: Request, res: Response) => {
    const { data: { tax_ids } } = await licenseServerKeyRequest.get(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details/tax-ids`
    );

    return res.status(200).send(tax_ids); 
}

/**
 * Add tax id to organization
 */
export const addOrganizationTaxId = async (req: Request, res: Response) => {
    const {
        type,
        value
    } = req.body;

    const { data } = await licenseServerKeyRequest.post(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details/tax-ids`,
        {
            type,
            value
        }
    );

    return res.status(200).send(data); 
}

/**
 * Delete tax id with id [taxId] from organization tax ids on file
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteOrganizationTaxId = async (req: Request, res: Response) => {
    const { taxId } = req.params;

    const { data } = await licenseServerKeyRequest.delete(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details/tax-ids/${taxId}`,
    );
        
    return res.status(200).send(data); 
}

/**
 * Return organization's invoices on file
 * @param req 
 * @param res 
 * @returns 
 */
export const getOrganizationInvoices = async (req: Request, res: Response) => {
    const { data: { invoices } } = await licenseServerKeyRequest.get(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/invoices`
    );

    return res.status(200).send(invoices); 
}

/**
 * Return organization's licenses on file
 * @param req 
 * @param res 
 * @returns 
 */
export const getOrganizationLicenses = async (req: Request, res: Response) => {
    const { data: { licenses } } = await licenseServerKeyRequest.get(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/licenses`
    );

    return res.status(200).send(licenses); 
}