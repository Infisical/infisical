import { TFeatureSet } from "../../ce/model/license-types";

export const withSelfHostedLicenseBase = (defaults: TFeatureSet): TFeatureSet => ({
  ...defaults,
  maxCas: null
});
