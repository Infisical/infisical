import { TFeatureDescriptor, TFeatureValue, TLimitFeatureDescriptor } from "./feature";
import { TEntitlementsResponse } from "./license-client-types";

export const resolveFeatureValue = <T extends TFeatureValue>(
  feature: TFeatureDescriptor<T>,
  entitlements: TEntitlementsResponse | null
): T => {
  const resolved = entitlements?.features?.[feature.key];
  if (resolved && resolved.value !== null && resolved.value !== undefined) {
    return resolved.value as T;
  }
  return feature.fallback;
};

export const isLimitFeature = (feature: TFeatureDescriptor): feature is TLimitFeatureDescriptor =>
  "limit" in feature && (feature as TLimitFeatureDescriptor).limit === true;
