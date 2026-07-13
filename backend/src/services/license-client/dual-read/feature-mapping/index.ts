import { TFeatureMapping } from "../dual-read-types";
import { accessMappings } from "./access";
import { coreMappings } from "./core";
import { existingDescriptorMappings } from "./existing";
import { limitsMappings } from "./limits";
import { pkiSecurityMappings } from "./pki-security";

export const FEATURE_MAPPINGS: TFeatureMapping[] = [
  ...existingDescriptorMappings,
  ...coreMappings,
  ...accessMappings,
  ...pkiSecurityMappings,
  ...limitsMappings
];

// v1 TFeatureSet keys intentionally not compared: live usage counters, plan metadata, and v1 fields
// with no License Server v2 feature (v2 never returns them, so a mapping would be permanently v2_missing).
export const EXCLUDED_FIELDS: ReadonlySet<string> = new Set([
  "_id",
  "slug",
  "tier",
  "status",
  "trial_end",
  "has_used_trial",
  "workspacesUsed",
  "membersUsed",
  "identitiesUsed",
  "environmentsUsed",
  "workspaceLimit",
  "memberLimit",
  "enterpriseCertificateSyncs",
  "pkiLegacyTemplates"
]);
