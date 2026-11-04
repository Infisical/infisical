import { TFeatureSet } from "./license-types";

export const withSelfHostedLicenseBase = (defaults: TFeatureSet): TFeatureSet => ({
  ...defaults,
  maxCas: null
});
