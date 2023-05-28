import NodeCache from 'node-cache';
import * as Sentry from '@sentry/node';
import { 
    getLicenseKey,
    getLicenseServerKey,
    getLicenseServerUrl
} from '../../config';
import { 
    licenseKeyRequest,
    licenseServerKeyRequest,
    refreshLicenseServerKeyToken,
    refreshLicenseKeyToken
} from '../../config/request';
import { Organization } from '../../models';
import { OrganizationNotFoundError } from '../../utils/errors';

interface FeatureSet {
    _id: string | null;
    slug: 'starter' | 'team' | 'pro' | 'enterprise' | null;
    tier: number;
    workspaceLimit: number | null;
    workspacesUsed: number;
    memberLimit: number | null;
    membersUsed: number;
    secretVersioning: boolean;
    pitRecovery: boolean;
    rbac: boolean;
    customRateLimits: boolean;
    customAlerts: boolean;
    auditLogs: boolean;
}

/**
 * Class to handle license/plan configurations:
 * - Infisical Cloud: Fetch and cache customer plans in [localFeatureSet]
 * - Self-hosted regular: Use default global feature set
 * - Self-hosted enterprise: Fetch and update global feature set
 */
class EELicenseService {
    
    private readonly _isLicenseValid: boolean; // TODO: deprecate

    public instanceType: 'self-hosted' | 'enterprise-self-hosted' | 'cloud' = 'self-hosted';

    public globalFeatureSet: FeatureSet = {
        _id: null,
        slug: null,
        tier: -1,
        workspaceLimit: null,
        workspacesUsed: 0,
        memberLimit: null,
        membersUsed: 0,
        secretVersioning: true,
        pitRecovery: true,
        rbac: true,
        customRateLimits: true,
        customAlerts: true,
        auditLogs: false
    }

    public localFeatureSet: NodeCache;
    
    constructor() {
        this._isLicenseValid = true;
        this.localFeatureSet = new NodeCache({
            stdTTL: 300
        });
    }
    
    public async getOrganizationPlan(organizationId: string): Promise<FeatureSet> {
        try {
            if (this.instanceType === 'cloud') {
                const cachedPlan = this.localFeatureSet.get<FeatureSet>(organizationId);
                if (cachedPlan) {
                    return cachedPlan;
                }

                const organization = await Organization.findById(organizationId);
                if (!organization) throw OrganizationNotFoundError();

                const { data: { currentPlan } } = await licenseServerKeyRequest.get(
                    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${organization.customerId}/cloud-plan`
                );

                // cache fetched plan for organization
                this.localFeatureSet.set(organizationId, currentPlan);

                return currentPlan;
            }
        } catch (err) {
            return this.globalFeatureSet;
        }

        return this.globalFeatureSet;
    }

    public async initGlobalFeatureSet() {
        const licenseServerKey = await getLicenseServerKey();
        const licenseKey = await getLicenseKey();

        try {
            if (licenseServerKey) {
                // license server key is present -> validate it
                const token = await refreshLicenseServerKeyToken()
                    
                if (token) {
                    this.instanceType = 'cloud';
                }
                
                return;
            }
            
            if (licenseKey) {
                // license key is present -> validate it
                const token = await refreshLicenseKeyToken();
                    
                if (token) {
                    const { data: { currentPlan } } = await licenseKeyRequest.get(
                        `${await getLicenseServerUrl()}/api/license/v1/plan`
                    );
                    
                    this.globalFeatureSet = currentPlan;
                    this.instanceType = 'enterprise-self-hosted';
                }
            }
        } catch (err) {
            // case: self-hosted free
            Sentry.setUser(null);
            Sentry.captureException(err);
        }
    }

    public get isLicenseValid(): boolean {
        return this._isLicenseValid;
    }
}

export default new EELicenseService();