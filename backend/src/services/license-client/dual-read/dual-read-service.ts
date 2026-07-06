import { TFeatureSet } from "@app/ee/services/license/license-types";
import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { recordLicenseDualReadDiff, recordLicenseDualReadError } from "@app/lib/telemetry/metrics";
import { TLicenseClientFactory } from "@app/services/license-client/license-client";

import { DualReadDiffKind } from "./dual-read-types";
import { compareEntitlements } from "./entitlement-comparator";
import { FEATURE_MAPPINGS } from "./feature-mapping";

export type TDualReadServiceFactory = ReturnType<typeof dualReadServiceFactory>;

type TDualReadServiceFactoryDep = {
  licenseClient: Pick<TLicenseClientFactory, "getEntitlements">;
  envConfig: Pick<TEnvConfig, "isLicenseDualReadEnabled">;
};

export const dualReadServiceFactory = ({ licenseClient, envConfig }: TDualReadServiceFactoryDep) => {
  // Fire-and-forget shadow compare against the already-resolved v1 plan. Never awaited, never throws into
  // the request path; inert unless mode is read-compare. Reads v2 through the real client SDK so the
  // production read path is exercised under real traffic ahead of the cutover.
  const compareInBackground = (orgId: string, planV1: TFeatureSet, getFreeTierPlan: () => TFeatureSet) => {
    if (!envConfig.isLicenseDualReadEnabled) {
      return;
    }

    void (async () => {
      const entitlements = await licenseClient.getEntitlements({ id: orgId });
      if (!entitlements) {
        recordLicenseDualReadError({ error: new Error("v2 entitlements unavailable") });
        logger.warn(`license-dual-read: v2 entitlements unavailable [orgId=${orgId}]`);
        return;
      }

      // v2 resolves an org with no license to the free tier (every feature source=default). Comparing that
      // against the org's real v1 plan is noise, so compare v2 against the v1 free baseline instead.
      const featureValues = Object.values(entitlements.features);
      const isV2Unlicensed = featureValues.length > 0 && featureValues.every((f) => f.source === "default");
      let planForCompare = planV1;
      if (isV2Unlicensed) {
        planForCompare = getFreeTierPlan();
      }

      const discrepancies = compareEntitlements(planForCompare, entitlements, FEATURE_MAPPINGS);
      const diffs = discrepancies.filter((d) => d.kind !== DualReadDiffKind.Match);

      for (const d of diffs) {
        recordLicenseDualReadDiff({ feature: d.v2Key, kind: d.kind });
        logger.info(
          { orgId, feature: d.v2Key, kind: d.kind, v1Value: d.v1Value, v2Value: d.v2Value },
          `license-dual-read discrepancy [orgId=${orgId}] [feature=${d.v2Key}] [kind=${d.kind}] [v1=${String(d.v1Value)}] [v2=${String(d.v2Value)}]`
        );
      }

      logger.info(
        `license-dual-read: compared entitlements [orgId=${orgId}] [diffs=${diffs.length}] [total=${discrepancies.length}]`
      );
    })().catch((error: unknown) => {
      recordLicenseDualReadError({ error });
      logger.error(error, `license-dual-read: compare failed [orgId=${orgId}]`);
    });
  };

  return { compareInBackground };
};
