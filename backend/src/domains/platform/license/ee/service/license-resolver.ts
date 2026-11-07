import { verifyOfflineLicense } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { InstanceType, LicenseType, TLicenseKeyConfig, TOfflineLicenseContents } from "../../ce/model/license-types";
import { TInstanceEntitlements, TPlan } from "../../ce/model/plan";
import { TRootOrg } from "../../ce/model/root-org";
import { withCloudPlanDefaults } from "../model/cloud-plan-defaults";
import { withSelfHostedLicenseBase } from "../model/self-hosted-license-base";
import { projectV2ToFeatureSet } from "./entitlement-projection";
// Imported by this exact specifier: the e2e suite aliases "./license-fns" to a permissive mock.
import { getDefaultOnPremFeatures, getLicenseKeyConfig } from "./license-fns";
import { TLicenseServerClient } from "./license-server/license-server-client";

// A self-hosted v2 license is single-tenant: the key identifies it, so entitlement reads carry this fixed id.
const SELF_HOSTED_LICENSE_ORG_ID = "self-hosted";

const community = (): TInstanceEntitlements => ({
  instanceType: InstanceType.OnPrem,
  features: getDefaultOnPremFeatures(),
  licenseId: null,
  customerId: null
});

export type TLicenseResolver = ReturnType<typeof licenseResolverFactory>;

export const licenseResolverFactory = ({
  isCloud,
  licenseKeyConfig,
  licenseServer
}: {
  isCloud: boolean;
  licenseKeyConfig: TLicenseKeyConfig;
  licenseServer: Pick<TLicenseServerClient, "getEntitlements" | "refreshEntitlements">;
}) => {
  const readOnlineLicense = async (): Promise<TInstanceEntitlements> => {
    const entitlements = await licenseServer.getEntitlements({ id: SELF_HOSTED_LICENSE_ORG_ID });
    if (!entitlements) {
      throw new BadRequestError({ message: "License Server v2 entitlements are unavailable" });
    }
    return {
      instanceType: InstanceType.EnterpriseOnPrem,
      features: projectV2ToFeatureSet(withSelfHostedLicenseBase(getDefaultOnPremFeatures()), entitlements),
      licenseId: null,
      customerId: null
    };
  };

  const readOfflineLicense = async (licenseKey: string): Promise<TInstanceEntitlements | null> => {
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

    return {
      instanceType: InstanceType.EnterpriseOnPremOffline,
      features: { ...features, slug: "enterprise", isOffline: true },
      licenseId: contents.license.licenseId,
      customerId: contents.license.customerId
    };
  };

  // The service key wins over a license key: it is what makes the instance Infisical Cloud. Anything that
  // fails to resolve leaves the community edition.
  const resolveInstanceEntitlements = async (): Promise<TInstanceEntitlements> => {
    try {
      if (isCloud) return { ...community(), instanceType: InstanceType.Cloud };
      if (licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Online) return await readOnlineLicense();
      if (licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Offline) {
        return (await readOfflineLicense(licenseKeyConfig.licenseKey)) ?? community();
      }
    } catch (error) {
      logger.error(error, `init-license: encountered an error when init license`);
    }
    return community();
  };

  const hasOnlineLicense = () => !isCloud && licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Online;

  const refreshInstanceEntitlements = async (): Promise<TInstanceEntitlements | null> => {
    if (!hasOnlineLicense()) return null;
    await licenseServer.refreshEntitlements({ id: SELF_HOSTED_LICENSE_ORG_ID });
    return readOnlineLicense();
  };

  const fetchPlan = async (rootOrg: TRootOrg): Promise<TPlan> => {
    const entitlements = await licenseServer.getEntitlements({
      id: rootOrg.id,
      name: rootOrg.name,
      slug: rootOrg.slug
    });
    if (!entitlements) {
      throw new BadRequestError({ message: "License Server entitlements are unavailable" });
    }
    return withCloudPlanDefaults(projectV2ToFeatureSet(getDefaultOnPremFeatures(), entitlements), entitlements);
  };

  return { resolveInstanceEntitlements, refreshInstanceEntitlements, hasOnlineLicense, fetchPlan };
};

export { getLicenseKeyConfig };
