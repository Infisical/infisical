import { logger } from "@app/lib/logger";

import {
  TFeatureCounterFn,
  TFeatureDescriptor,
  TFeatureResult,
  TLimitFeature,
  TLimitFeatureDescriptor
} from "./feature";
import { isLimitFeature, resolveFeatureValue } from "./license-client-fns";
import { TEntitlementOrg, TEntitlementsResponse } from "./license-client-types";

type TFeatureReaderDep = {
  getEntitlements: (org: TEntitlementOrg) => Promise<TEntitlementsResponse | null>;
};

export type TFeatureReader = ReturnType<typeof featureReaderFactory>;

export const featureReaderFactory = ({ getEntitlements }: TFeatureReaderDep) => {
  const counters = new Map<string, TFeatureCounterFn>();

  const registerCounter = (feature: TLimitFeatureDescriptor, fn: TFeatureCounterFn) => {
    counters.set(feature.key, fn);
  };

  const buildLimitFeature = (orgId: string, feature: TLimitFeatureDescriptor, value: number): TLimitFeature => ({
    key: feature.key,
    value,
    canUse: async (requested: number = 1) => {
      const counter = counters.get(feature.key);
      if (!counter) {
        logger.warn(`license-client: no counter registered for limit feature [key=${feature.key}]; allowing use`);
        return requested <= value;
      }
      const current = await counter(orgId);
      return current + requested <= value;
    }
  });

  const getFeature = async <D extends TFeatureDescriptor>(orgId: string, feature: D): Promise<TFeatureResult<D>> => {
    const entitlements = await getEntitlements({ id: orgId });
    const value = resolveFeatureValue(feature, entitlements);

    if (isLimitFeature(feature)) {
      return buildLimitFeature(orgId, feature, value as number) as unknown as TFeatureResult<D>;
    }

    return { key: feature.key, value } as unknown as TFeatureResult<D>;
  };

  return { getFeature, registerCounter };
};
