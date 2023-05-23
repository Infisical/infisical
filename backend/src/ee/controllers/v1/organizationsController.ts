import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';
import { getLicenseServerUrl } from '../../../config';
import { licenseServerKeyRequest } from '../../../config/request';
import { EELicenseService } from '../../services';

/**
 * Return the organization's current plan and allowed feature set
 */
export const getOrganizationPlan = async (req: Request, res: Response) => {
    try {
        if (EELicenseService.instanceType === 'cloud') {
            // instance of Infisical is a cloud instance

            const cachedPlan = EELicenseService.localFeatureSet.get(req.organization._id.toString());
            if (cachedPlan) return cachedPlan;

            const { data: { currentPlan } } = await licenseServerKeyRequest.get(
                `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/cloud-plan`
            );

            // cache fetched plan for organization
            EELicenseService.localFeatureSet.set(req.organization._id.toString(), currentPlan);

            return res.status(200).send({
                plan: currentPlan
            });
        }
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
    }

    return res.status(200).send({
        plan: EELicenseService.globalFeatureSet
    });
}

/**
 * Update the organization plan to product with id [productId]
 * @param req 
 * @param res 
 * @returns 
 */
export const updateOrganizationPlan = async (req: Request, res: Response) => {
    const {
        productId
    } = req.body;

    const { data  } = await licenseServerKeyRequest.patch(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/cloud-plan`,
        {
            productId
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

    return res.status(200).send({
        pmtMethods
    }); 
}

/**
 * Return a Stripe session URL to add payment method for organization
 */
export const addOrganizationPmtMethod = async (req: Request, res: Response) => {
    const {
        success_url,
        cancel_url
    } = req.body;
    
    const { data: { url } } = await licenseServerKeyRequest.post(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details/payment-methods`,
        {
            success_url,
            cancel_url
        }
    );
    
    return res.status(200).send({
        url
    }); 
}

export const deleteOrganizationPmtMethod = async (req: Request, res: Response) => {
    const { pmtMethodId } = req.params;

    const { data } = await licenseServerKeyRequest.delete(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details/payment-methods/${pmtMethodId}`,
    );
        
    return res.status(200).send(data);
}