import { Types } from 'mongoose';
import * as Sentry from '@sentry/node';
import { Organization } from '../../models';
import { EELicenseService } from '../services';
import { getLicenseServerUrl } from '../../config';
import { licenseServerKeyRequest } from '../../config/request';
import { OrganizationNotFoundError } from '../../utils/errors';

export const getOrganizationPlanHelper = async ({
    organizationId
}: {
    organizationId: Types.ObjectId;
}) => {
    try {
        if (EELicenseService.instanceType === 'cloud') {
            // instance of Infisical is a cloud instance
            
            const organization = await Organization.findById(organizationId);
            if (!organization) throw OrganizationNotFoundError();

            const cachedPlan = EELicenseService.localFeatureSet.get(organizationId.toString());
            if (cachedPlan) return cachedPlan;

            const { data: { currentPlan } } = await licenseServerKeyRequest.get(
                `${await getLicenseServerUrl()}/api/license-server/v1/customers/${organization.customerId}/cloud-plan`
            );

            // cache fetched plan for organization
            EELicenseService.localFeatureSet.set(organizationId.toString(), currentPlan);
            return currentPlan;
        }
        
        return EELicenseService.globalFeatureSet;
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        return EELicenseService.globalFeatureSet;
    }
}