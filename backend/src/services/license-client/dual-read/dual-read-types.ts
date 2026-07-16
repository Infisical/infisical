import { TFeatureSet } from "@app/ee/services/license/license-types";

import { TFeatureValue } from "../feature";

export enum DualReadDiffKind {
  Match = "match",
  Mismatch = "mismatch",
  V2Missing = "v2_missing",
  V1Absent = "v1_absent",
  Indeterminate = "indeterminate"
}

// Sentinel so a v1 null (unlimited cap) compares equal to a v2 unlimited representation. It is a
// plain string value, so TNormalizedValue stays TFeatureValue | null.
export const UNLIMITED = "unlimited" as const;

export type TNormalizedValue = TFeatureValue | null;

export type TFeatureMapping = {
  // Must match a License Server v2 feature registry key (a separate repo); a wrong key surfaces as a v2_missing diff.
  v2Key: string;
  // The TFeatureSet field name this maps to (drives the completeness test); dotted for nested
  // fields (e.g. "rateLimits.readLimit"). null when v2-only.
  v1Field: string | null;
  // Resolves the v1 value. null when there is no corresponding v1 field (v2-only descriptor).
  extractV1: ((plan: TFeatureSet) => TFeatureValue | null) | null;
  // Normalizes a value before comparison (e.g. null -> UNLIMITED). Applied to both sides.
  normalize?: (value: TFeatureValue | null) => TNormalizedValue;
};

export type TDiscrepancy = {
  v2Key: string;
  kind: DualReadDiffKind;
  v1Value: TNormalizedValue;
  v2Value: TNormalizedValue;
};

// Maps a possibly-null cap to UNLIMITED; reusable by mapping files for "null = unlimited" v1 caps.
export const unlimitedWhenNull = (value: TFeatureValue | null): TNormalizedValue => {
  if (value === null || value === undefined) {
    return UNLIMITED;
  }
  return value;
};
