import { describe, expect, it } from "vitest";

import { PamFieldWidget, TPamFieldDescriptor } from "@app/hooks/api/pam";

import {
  buildDefaultFieldValues,
  buildEditFieldValues,
  omitUnsetAbsentFields
} from "./accountFormSchema";

const field = (overrides: Partial<TPamFieldDescriptor> & { key: string }): TPamFieldDescriptor =>
  ({ label: overrides.key, widget: PamFieldWidget.Text, ...overrides }) as TPamFieldDescriptor;

describe("buildEditFieldValues", () => {
  it("keeps a stored value rather than the descriptor default", () => {
    const fields = [field({ key: "port", widget: PamFieldWidget.Number, defaultValue: 8123 })];
    expect(buildEditFieldValues(fields, { port: 9000 })).toEqual({ port: 9000 });
  });

  it("leaves an absent field empty rather than seeding the descriptor default", () => {
    const fields = [field({ key: "port", widget: PamFieldWidget.Number, defaultValue: 8123 })];
    expect(buildEditFieldValues(fields, { nativePort: 9000 })).toEqual({ port: "" });
  });

  it("still seeds descriptor defaults on the create path", () => {
    const fields = [field({ key: "port", widget: PamFieldWidget.Number, defaultValue: 8123 })];
    expect(buildDefaultFieldValues(fields)).toEqual({ port: 8123 });
  });
});

describe("omitUnsetAbsentFields", () => {
  it("omits a field the account never stored so a schema default can apply", () => {
    expect(omitUnsetAbsentFields({ host: "h", winrmPort: "" }, { host: "h" })).toEqual({
      host: "h"
    });
  });

  it("sends an empty string for a stored field the user cleared", () => {
    expect(omitUnsetAbsentFields({ port: "" }, { port: 8123 })).toEqual({ port: "" });
  });

  it("leaves non-empty values alone", () => {
    expect(omitUnsetAbsentFields({ port: 9000, ssl: false }, {})).toEqual({
      port: 9000,
      ssl: false
    });
  });
});
