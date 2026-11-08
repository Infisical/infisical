import { TEntitlementsResponse } from "../../ce/license-server-client/license-server-types";
import { TInstanceFeatures } from "../../ce/model/instance-entitlements";

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
  // v1 (or absent) offline licenses carry the legacy feature-flag set directly; version 2 licenses
  // carry License Server v2 entitlements, which we project into the same feature shape.
  version?: number;
  features: TInstanceFeatures;
  entitlements?: TEntitlementsResponse;
};

export type TOfflineLicenseContents = {
  license: TOfflineLicense;
  signature: string;
};
