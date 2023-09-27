import { enableMfaAuthAppStep1 } from "@app/hooks/api/mfa/queries";

const generateSecretKey = async (): Promise<string | undefined> => {
  try {
    const secretKey = await enableMfaAuthAppStep1(); // base32
    return secretKey;
  } catch (err) {
    console.error("Error generating secret key:", err);
    return undefined;
  }
};

// These settings need to match the backend verifyAuthAppTotp function
// See comments there on implementation details
// Only the issuer name can be changed here

const authAppSettings = Object.freeze({
  otpType: "totp" as const,
  issuer: "Infisical",
  hashFunction: "SHA256" as const,
  digits: 6 as const,
  period: 30 as const,
});

interface GenerateConfigOptions {
  name: string;
  userId: string;
};

export const generateMfaAuthAppConfigUri = async ({ name }: GenerateConfigOptions) => {
  const secretKey = await generateSecretKey(); // base32 (stored in db with SSE)
  
  if (!secretKey) {
    return undefined;
  };

  const { otpType, issuer, hashFunction, digits, period } = authAppSettings;

  const paramMappings = {
    otpType: encodeURIComponent(otpType),
    issuer: encodeURIComponent(issuer),
    name: encodeURIComponent(name),
    hashFunction: encodeURIComponent(hashFunction),
    digits: encodeURIComponent(digits.toString()),
    period: encodeURIComponent(period.toString()),
    secretKey: encodeURIComponent(secretKey),
  };

  const uri = `otpauth://totp/${paramMappings.issuer}:${paramMappings.name}?secret=${paramMappings.secretKey}&issuer=${paramMappings.issuer}&algorithm=${paramMappings.hashFunction}&digits=${paramMappings.digits}&period=${paramMappings.period}`;

  const payload = { secretKey, uri };

  return payload;
};
