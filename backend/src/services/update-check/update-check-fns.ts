// Parses release tags / platform versions like "v0.162.10", "0.162.10" or
// "0.162.10-nightly-20260721" (the base version is used). Returns null for anything
// that is not semver-shaped (dev mode, dedicated instance hash versions, etc.)
export const parseSemanticVersion = (version?: string) => {
  if (!version) return null;

  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i.exec(version.trim());
  if (!match) return null;

  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
};

export type TSemanticVersion = NonNullable<ReturnType<typeof parseSemanticVersion>>;

export const isVersionNewer = (candidate: TSemanticVersion, current: TSemanticVersion) => {
  if (candidate.major !== current.major) return candidate.major > current.major;
  if (candidate.minor !== current.minor) return candidate.minor > current.minor;
  return candidate.patch > current.patch;
};

export type TUpdateCheckGateInput = {
  isInfisicalCloud: boolean;
  isCloud: boolean;
  isUpdateCheckDisabled: boolean;
  hasOfflineLicense: boolean;
  platformVersion?: string;
};

// The update check only applies to standard self-hosted instances: cloud deploys
// continuously, dedicated instances use hash versions that cannot be compared, and
// an offline license explicitly signals an intentionally air-gapped instance.
export const isUpdateCheckEnabled = (input: TUpdateCheckGateInput) =>
  !input.isInfisicalCloud &&
  !input.isCloud &&
  !input.isUpdateCheckDisabled &&
  !input.hasOfflineLicense &&
  Boolean(parseSemanticVersion(input.platformVersion));
