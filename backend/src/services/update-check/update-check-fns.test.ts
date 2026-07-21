import {
  isUpdateCheckEnabled,
  isVersionNewer,
  parseSemanticVersion,
  TSemanticVersion,
  TUpdateCheckGateInput
} from "./update-check-fns";

const version = (value: string): TSemanticVersion => {
  const parsed = parseSemanticVersion(value);
  if (!parsed) throw new Error(`Invalid test version: ${value}`);
  return parsed;
};

describe("parseSemanticVersion", () => {
  test("parses plain semantic versions", () => {
    expect(parseSemanticVersion("0.162.10")).toEqual({ major: 0, minor: 162, patch: 10 });
  });

  test("parses versions with a leading v", () => {
    expect(parseSemanticVersion("v0.162.10")).toEqual({ major: 0, minor: 162, patch: 10 });
    expect(parseSemanticVersion("V0.162.10")).toEqual({ major: 0, minor: 162, patch: 10 });
  });

  test("parses nightly/prerelease versions to their base version", () => {
    expect(parseSemanticVersion("0.163.0-nightly-20260721")).toEqual({ major: 0, minor: 163, patch: 0 });
    expect(parseSemanticVersion("v0.163.0-nightly-20260721.1")).toEqual({ major: 0, minor: 163, patch: 0 });
  });

  test("returns null for values that are not semver-shaped", () => {
    expect(parseSemanticVersion(undefined)).toBeNull();
    expect(parseSemanticVersion("")).toBeNull();
    // dedicated instances use commit hash versions
    expect(parseSemanticVersion("a1b2c3d")).toBeNull();
    expect(parseSemanticVersion("0.162")).toBeNull();
    expect(parseSemanticVersion("0.162.10.1")).toBeNull();
    expect(parseSemanticVersion("latest")).toBeNull();
  });
});

describe("isVersionNewer", () => {
  test("returns false for equal versions", () => {
    expect(isVersionNewer(version("0.162.10"), version("0.162.10"))).toBe(false);
  });

  test("compares patch versions", () => {
    expect(isVersionNewer(version("0.162.11"), version("0.162.10"))).toBe(true);
    expect(isVersionNewer(version("0.162.9"), version("0.162.10"))).toBe(false);
  });

  test("a minor bump outranks a higher patch", () => {
    expect(isVersionNewer(version("0.163.0"), version("0.162.10"))).toBe(true);
    expect(isVersionNewer(version("0.162.10"), version("0.163.0"))).toBe(false);
  });

  test("a major bump outranks a higher minor", () => {
    expect(isVersionNewer(version("1.0.0"), version("0.999.999"))).toBe(true);
  });

  test("compares numerically, not lexicographically", () => {
    expect(isVersionNewer(version("0.10.0"), version("0.9.0"))).toBe(true);
    expect(isVersionNewer(version("0.100.0"), version("0.99.0"))).toBe(true);
  });
});

describe("isUpdateCheckEnabled", () => {
  const connectedSelfHosted: TUpdateCheckGateInput = {
    isInfisicalCloud: false,
    isCloud: false,
    isUpdateCheckDisabled: false,
    hasOfflineLicense: false,
    platformVersion: "0.162.10"
  };

  test("enabled for a standard self-hosted instance with a semver version", () => {
    expect(isUpdateCheckEnabled(connectedSelfHosted)).toBe(true);
  });

  test("disabled on cloud instances", () => {
    expect(isUpdateCheckEnabled({ ...connectedSelfHosted, isInfisicalCloud: true })).toBe(false);
    expect(isUpdateCheckEnabled({ ...connectedSelfHosted, isCloud: true })).toBe(false);
  });

  test("disabled by the DISABLE_UPDATE_CHECK flag", () => {
    expect(isUpdateCheckEnabled({ ...connectedSelfHosted, isUpdateCheckDisabled: true })).toBe(false);
  });

  test("disabled when an offline license is configured", () => {
    expect(isUpdateCheckEnabled({ ...connectedSelfHosted, hasOfflineLicense: true })).toBe(false);
  });

  test("disabled without a comparable platform version", () => {
    expect(isUpdateCheckEnabled({ ...connectedSelfHosted, platformVersion: undefined })).toBe(false);
    // dedicated instances use commit hash versions
    expect(isUpdateCheckEnabled({ ...connectedSelfHosted, platformVersion: "a1b2c3d" })).toBe(false);
  });
});
