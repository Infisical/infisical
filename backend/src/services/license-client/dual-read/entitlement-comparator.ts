import { TFeatureSet } from "@app/ee/services/license/license-types";

import { TEntitlementsResponse } from "../license-client-types";
import { DualReadDiffKind, TDiscrepancy, TFeatureMapping, TNormalizedValue, UNLIMITED } from "./dual-read-types";

const identity = (value: TNormalizedValue): TNormalizedValue => value;

const compareOne = (plan: TFeatureSet, entitlements: TEntitlementsResponse, mapping: TFeatureMapping): TDiscrepancy => {
  const normalize = mapping.normalize ?? identity;
  const v2Raw = entitlements.features[mapping.v2Key];

  // Resolve the v2 side once. The entitlement schema allows a null value, and a normalize (e.g.
  // unlimitedWhenNull) may turn that into a real value; anything still null means v2 resolved nothing.
  let v2Value: TNormalizedValue = null;
  if (v2Raw) {
    v2Value = normalize(v2Raw.value);
  }

  if (mapping.extractV1 === null) {
    return { v2Key: mapping.v2Key, kind: DualReadDiffKind.V1Absent, v1Value: null, v2Value };
  }

  const v1Value = normalize(mapping.extractV1(plan));

  if (v2Value === null) {
    return { v2Key: mapping.v2Key, kind: DualReadDiffKind.V2Missing, v1Value, v2Value: null };
  }

  let kind = DualReadDiffKind.Mismatch;
  if (v1Value === v2Value) {
    kind = DualReadDiffKind.Match;
  } else if ((v1Value === UNLIMITED) !== (v2Value === UNLIMITED)) {
    // v2 has no pinned cross-repo "unlimited" representation, so this can't be confirmed a mismatch.
    kind = DualReadDiffKind.Indeterminate;
  }

  return { v2Key: mapping.v2Key, kind, v1Value, v2Value };
};

export const compareEntitlements = (
  plan: TFeatureSet,
  entitlements: TEntitlementsResponse,
  mappings: TFeatureMapping[]
): TDiscrepancy[] => mappings.map((mapping) => compareOne(plan, entitlements, mapping));
