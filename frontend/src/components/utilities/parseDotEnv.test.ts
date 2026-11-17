import { describe, expect, it } from "vitest";

import { formatSecretEnvFile } from "@app/helpers/download";

import { parseDotEnv } from "./parseSecrets";

describe("parseDotEnv", () => {
  it.each([
    '{"type":"service_account","project_id":"demo"}',
    String.raw`C:\new\tokens`,
    String.raw`one\ntwo\rthree`,
    String.raw`a\"b`,
    "ends with \\",
    ""
  ])("round-trips exported value %j", (value) => {
    const exported = formatSecretEnvFile([{ secretKey: "CONFIG", secretValue: value }], []);

    expect(parseDotEnv(exported)).toEqual({ CONFIG: { value, comments: [] } });
  });

  it("decodes escaped line breaks in double-quoted values", () => {
    expect(parseDotEnv(String.raw`CONFIG="one\ntwo\rthree"`)).toEqual({
      CONFIG: { value: "one\ntwo\rthree", comments: [] }
    });
  });

  it("preserves unknown escape sequences in double-quoted values", () => {
    expect(parseDotEnv(String.raw`CONFIG="one\ttwo\qthree\$four"`)).toEqual({
      CONFIG: { value: String.raw`one\ttwo\qthree\$four`, comments: [] }
    });
  });

  it.each(["'", "`", ""])("preserves literal escapes with %j quoting", (quote) => {
    const value = String.raw`one\ntwo\rthree\\four`;

    expect(parseDotEnv(`CONFIG=${quote}${value}${quote}`)).toEqual({
      CONFIG: { value, comments: [] }
    });
  });
});
