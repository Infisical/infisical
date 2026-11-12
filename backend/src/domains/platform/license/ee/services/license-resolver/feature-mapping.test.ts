import { describe, expect, test } from "vitest";

import { EXCLUDED_FIELDS, FEATURE_MAPPINGS } from "./feature-mapping";
import { getDefaultOnPremFeatures } from "./license-fns";

const topLevelV1Field = (v1Field: string): string => {
  const dotIndex = v1Field.indexOf(".");
  if (dotIndex === -1) {
    return v1Field;
  }
  return v1Field.slice(0, dotIndex);
};

describe("feature mapping completeness", () => {
  test("every v1 TInstanceFeatures field is excluded or referenced by a mapping", () => {
    const referenced = new Set<string>();
    for (const mapping of FEATURE_MAPPINGS) {
      if (mapping.v1Field) {
        referenced.add(topLevelV1Field(mapping.v1Field));
      }
    }

    const planFields = Object.keys(getDefaultOnPremFeatures());
    const uncovered = planFields.filter((field) => !EXCLUDED_FIELDS.has(field) && !referenced.has(field));

    expect(uncovered).toEqual([]);
  });
});
