import { TEnvConfig } from "@app/lib/config/env";

import { TInstanceFeatures } from "../../../ce/models/instance-entitlements";
import { TEntitlementsResponse } from "../../../ce/services/helpers/license-server-types";

export enum LicenseType {
  Offline = "offline",
  // Self-hosted online license key; resolves entitlements from License Server v2.
  Online = "online"
}

export type TLicenseKeyConfig =
  | {
      isValid: false;
    }
  | {
      isValid: true;
      licenseKey: string;
      type: LicenseType;
    };

export type TOfflineLicense = {
  issuedTo: string;
  licenseId: string;
  customerId: string | null;
  issuedAt: string;
  expiresAt: string | null;
  terminatesAt: string | null;
  // Absent or 1: the legacy feature-flag set. 2: License Server v2 entitlements, projected into the same shape.
  version?: number;
  features: TInstanceFeatures;
  entitlements?: TEntitlementsResponse;
};

export type TOfflineLicenseContents = {
  license: TOfflineLicense;
  signature: string;
};

const isOfflineKey = (licenseKey: string): boolean => {
  try {
    const contents = JSON.parse(Buffer.from(licenseKey, "base64").toString("utf8")) as TOfflineLicenseContents;

    return "signature" in contents && "license" in contents;
  } catch (error) {
    return false;
  }
};

export const getLicenseKeyConfig = (
  cfg: Pick<TEnvConfig, "LICENSE_KEY" | "LICENSE_KEY_OFFLINE">
): TLicenseKeyConfig => {
  const licenseKey = cfg.LICENSE_KEY;

  if (licenseKey) {
    if (isOfflineKey(licenseKey)) {
      return { isValid: true, licenseKey, type: LicenseType.Offline };
    }

    return { isValid: true, licenseKey, type: LicenseType.Online };
  }

  const offlineLicenseKey = cfg.LICENSE_KEY_OFFLINE;

  // Legacy env var, still read for offline keys.
  if (offlineLicenseKey) {
    if (isOfflineKey(offlineLicenseKey)) {
      return { isValid: true, licenseKey: offlineLicenseKey, type: LicenseType.Offline };
    }

    return { isValid: false };
  }

  return { isValid: false };
};

// An offline (air-gapped) license must never reach the License Server.
export const isOfflineLicenseKey = (licenseKeyConfig: TLicenseKeyConfig) =>
  licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Offline;
