import { describe, expect, test } from "vitest";

import { RunMode } from "@app/lib/types";

import { runModesSchema } from "./env";

describe("INFISICAL_RUN_MODES parsing", () => {
  test("defaults to every run mode when unset", () => {
    expect(runModesSchema.parse(undefined)).toEqual([RunMode.Api, RunMode.GeneralWorkers, RunMode.SecretScanning]);
  });

  test("defaults to every run mode when blank", () => {
    expect(runModesSchema.parse("   ")).toEqual([RunMode.Api, RunMode.GeneralWorkers, RunMode.SecretScanning]);
  });

  test("parses a single run mode", () => {
    expect(runModesSchema.parse("api")).toEqual([RunMode.Api]);
  });

  test("tolerates surrounding whitespace and casing", () => {
    expect(runModesSchema.parse(" General-Workers , secret-scanning ")).toEqual([
      RunMode.GeneralWorkers,
      RunMode.SecretScanning
    ]);
  });

  test("rejects an unknown run mode instead of silently ignoring it", () => {
    const result = runModesSchema.safeParse("api,workers");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("api, general-workers, secret-scanning");
    }
  });

  test("rejects a list that names no run mode", () => {
    expect(runModesSchema.safeParse(",,").success).toBe(false);
  });
});
