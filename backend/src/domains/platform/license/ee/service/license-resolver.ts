import { ExternalSystemError } from "@app/domains/lib/errors";
import { verifyOfflineLicense } from "@app/lib/crypto";
import { logger } from "@app/lib/logger";

import { InstanceEntitlements, InstanceType } from "../../ce/model/instance-entitlements";
import { Plan } from "../../ce/model/plan";
import { TLicenseProvider } from "../../ce/service/dependencies";
import {
  SELF_HOSTED_LICENSE_ORG_ID,
  TEntitlementOrg
} from "../../ce/service/license-server-types/license-server-types";
import { TLicenseServerEntitlements } from "./dependencies";
import { projectV2ToFeatureSet, withCloudPlanDefaults, withSelfHostedLicenseBase } from "./entitlement-projection";
// Keep this exact specifier: the e2e suite aliases "./license-fns" to a permissive mock.
import { getDefaultOnPremFeatures, getLicenseKeyConfig } from "./license-fns";
import { LicenseType, TLicenseKeyConfig, TOfflineLicenseContents } from "./offline-license";

const community = (): InstanceEntitlements =>
  InstanceEntitlements.restore({
    instanceType: InstanceType.OnPrem,
    features: getDefaultOnPremFeatures(),
    licenseId: null,
    customerId: null
  });

// Verified against the public key in the image; never reaches the License Server.
const readOfflineLicense = async (licenseKey: string): Promise<InstanceEntitlements | null> => {
  const contents = JSON.parse(Buffer.from(licenseKey, "base64").toString("utf8")) as TOfflineLicenseContents;
  if (!(await verifyOfflineLicense(JSON.stringify(contents.license), contents.signature))) {
    logger.warn(`Infisical EE offline license verification failed`);
    return null;
  }
  if (contents.license.terminatesAt && new Date(contents.license.terminatesAt) < new Date()) {
    logger.warn(`Infisical EE offline license has expired`);
    return null;
  }

  // A v1 feature set is a snapshot frozen when the key was issued, so it is layered over current defaults:
  // otherwise every flag added since reads as undefined, withdrawing features the license paid for.
  const features =
    contents.license.version === 2 && contents.license.entitlements
      ? projectV2ToFeatureSet(withSelfHostedLicenseBase(getDefaultOnPremFeatures()), contents.license.entitlements)
      : { ...withSelfHostedLicenseBase(getDefaultOnPremFeatures()), ...contents.license.features };

  // Keys issued before PAM alerts moved to the alert module grant them through the old Slack flag.
  if ((contents.license.features as { pamSlackNotifications?: boolean } | undefined)?.pamSlackNotifications) {
    features.pamEnterpriseAlerting = true;
  }

  return InstanceEntitlements.restore({
    instanceType: InstanceType.EnterpriseOnPremOffline,
    features: { ...features, slug: "enterprise", isOffline: true },
    licenseId: contents.license.licenseId,
    customerId: contents.license.customerId
  });
};

// An offline (air-gapped) license must never reach the License Server.
export const isOfflineLicenseKey = (licenseKeyConfig: TLicenseKeyConfig) =>
  licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Offline;

export type TLicenseResolverDeps = {
  isCloud: boolean;
  licenseKeyConfig: TLicenseKeyConfig;
  licenseServerClient: TLicenseServerEntitlements;
};

export class LicenseResolver implements TLicenseProvider {
  constructor(private readonly deps: TLicenseResolverDeps) {}

  // The service key wins over a license key: it is what makes the instance Infisical Cloud. Anything that
  // fails to resolve leaves the community edition.
  async resolveInstanceEntitlements(): Promise<InstanceEntitlements> {
    const { isCloud, licenseKeyConfig } = this.deps;
    try {
      if (isCloud) return InstanceEntitlements.restore({ ...community().toJSON(), instanceType: InstanceType.Cloud });
      if (this.hasOnlineLicense()) return await this.readOnlineLicense();
      if (licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Offline) {
        return (await readOfflineLicense(licenseKeyConfig.licenseKey)) ?? community();
      }
    } catch (error) {
      logger.error(error, `init-license: encountered an error when init license`);
    }
    return community();
  }

  hasOnlineLicense(): boolean {
    const { isCloud, licenseKeyConfig } = this.deps;
    return !isCloud && licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Online;
  }

  // Reads an online license again; the License Server answers live, so there is nothing to invalidate first.
  async refreshInstanceEntitlements(): Promise<InstanceEntitlements | null> {
    if (!this.hasOnlineLicense()) return null;
    return this.readOnlineLicense();
  }

  isOffline(): boolean {
    return isOfflineLicenseKey(this.deps.licenseKeyConfig);
  }

  // eslint-disable-next-line class-methods-use-this
  fallbackPlan(): Plan {
    return Plan.restore(withCloudPlanDefaults(getDefaultOnPremFeatures(), null));
  }

  // Cloud: a root org's plan. Throws when the License Server cannot be read, so the domain serves the fallback.
  async fetchPlan(rootOrg: TEntitlementOrg): Promise<Plan> {
    const entitlements = await this.deps.licenseServerClient.getEntitlements(rootOrg);
    if (!entitlements) {
      throw new ExternalSystemError({ message: "License Server entitlements are unavailable" });
    }
    return Plan.restore(
      withCloudPlanDefaults(projectV2ToFeatureSet(getDefaultOnPremFeatures(), entitlements), entitlements)
    );
  }

  private async readOnlineLicense(): Promise<InstanceEntitlements> {
    const entitlements = await this.deps.licenseServerClient.getEntitlements({ id: SELF_HOSTED_LICENSE_ORG_ID });
    if (!entitlements) {
      throw new ExternalSystemError({ message: "License Server v2 entitlements are unavailable" });
    }
    return InstanceEntitlements.restore({
      instanceType: InstanceType.EnterpriseOnPrem,
      features: projectV2ToFeatureSet(withSelfHostedLicenseBase(getDefaultOnPremFeatures()), entitlements),
      licenseId: null,
      customerId: null
    });
  }
}

export { getLicenseKeyConfig };
