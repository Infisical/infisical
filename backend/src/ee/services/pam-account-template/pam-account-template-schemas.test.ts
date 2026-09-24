import { describe, expect, test } from "vitest";

import { PamTemplateSettingsInputSchema, PamTemplateSettingsSchema } from "./pam-account-template-schemas";

describe("session log masking settings", () => {
  describe("read path", () => {
    test("treats a template predating built-in detection as opted out", () => {
      const parsed = PamTemplateSettingsSchema.parse({});
      expect(parsed.sessionLogMaskingBuiltInDetection).toBe(false);
    });

    test("preserves an explicit choice", () => {
      expect(
        PamTemplateSettingsSchema.parse({ sessionLogMaskingBuiltInDetection: true }).sessionLogMaskingBuiltInDetection
      ).toBe(true);
      expect(
        PamTemplateSettingsSchema.parse({ sessionLogMaskingBuiltInDetection: false }).sessionLogMaskingBuiltInDetection
      ).toBe(false);
    });
  });

  describe("write path", () => {
    // A default here would switch detection on during an unrelated edit.
    test("leaves the field absent when the caller omits it", () => {
      const parsed = PamTemplateSettingsInputSchema.parse({ recordingStorageBackend: "postgres" });
      expect(parsed.sessionLogMaskingBuiltInDetection).toBeUndefined();
      expect("sessionLogMaskingBuiltInDetection" in parsed).toBe(false);
    });

    test("carries an explicit choice through", () => {
      expect(
        PamTemplateSettingsInputSchema.parse({ sessionLogMaskingBuiltInDetection: true })
          .sessionLogMaskingBuiltInDetection
      ).toBe(true);
      expect(
        PamTemplateSettingsInputSchema.parse({ sessionLogMaskingBuiltInDetection: false })
          .sessionLogMaskingBuiltInDetection
      ).toBe(false);
    });

    test("rejects a non-boolean", () => {
      expect(PamTemplateSettingsInputSchema.safeParse({ sessionLogMaskingBuiltInDetection: "yes" }).success).toBe(
        false
      );
    });
  });
});
