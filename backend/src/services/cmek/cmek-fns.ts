import { getConfig } from "@app/lib/config/env";
import { isJwkKeyAlgorithm } from "@app/lib/crypto/sign";

import { KmsKeyUsage } from "../kms/kms-types";

export const canPublishCmekPublicKey = ({
  keyUsage,
  encryptionAlgorithm
}: {
  keyUsage: string;
  encryptionAlgorithm: string;
}) => keyUsage === KmsKeyUsage.SIGN_VERIFY && isJwkKeyAlgorithm(encryptionAlgorithm);

// Carries the version so sign-verify key versions can get their own kid later; a published kid can never change
export const getCmekJwkKid = (keyId: string, version: number) => `${keyId}:v${version}`;

export const getCmekJwksUrl = (keyId: string) => {
  const { SITE_URL } = getConfig();
  return SITE_URL ? `${SITE_URL}/api/v1/kms/keys/${keyId}/jwks.json` : null;
};
