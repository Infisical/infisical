import { TInstanceFeatures } from "../../ce/model/instance-entitlements";

export const withSelfHostedLicenseBase = (defaults: TInstanceFeatures): TInstanceFeatures => ({
  ...defaults,
  maxCas: null
});
