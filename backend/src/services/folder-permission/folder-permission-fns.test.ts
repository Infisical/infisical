import { TemporaryPermissionMode } from "@app/db/schemas";
import { ms } from "@app/lib/ms";

import { computeTemporaryFields } from "./folder-permission-fns";

describe("computeTemporaryFields", () => {
  test.each([undefined, { isTemporary: false as const }])("returns permanent fields for %o", (input) => {
    expect(computeTemporaryFields(input)).toEqual({
      isTemporary: false,
      temporaryMode: null,
      temporaryRange: null,
      temporaryAccessStartTime: null,
      temporaryAccessEndTime: null
    });
  });

  test("computes a relative window from the provided start time", () => {
    const startTime = "2026-08-18T19:18:50.978Z";
    const result = computeTemporaryFields({
      isTemporary: true,
      temporaryMode: TemporaryPermissionMode.Relative,
      temporaryRange: "4h",
      temporaryAccessStartTime: startTime
    });

    expect(result.isTemporary).toBe(true);
    expect(result.temporaryMode).toBe(TemporaryPermissionMode.Relative);
    expect(result.temporaryRange).toBe("4h");
    expect(result.temporaryAccessStartTime).toEqual(new Date(startTime));
    expect(result.temporaryAccessEndTime!.getTime() - result.temporaryAccessStartTime!.getTime()).toBe(ms("4h"));
  });
});
