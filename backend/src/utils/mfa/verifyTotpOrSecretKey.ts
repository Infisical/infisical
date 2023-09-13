import { createHmac, timingSafeEqual } from 'crypto';
import { customBase32Decode } from './base32EncodeAndDecode';

const generateHotp = (secretKeyBuffer: Buffer, counter: number): string => {
  const buffer: Buffer = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) {
    buffer[7 - i] = counter & 0xff;
    counter = counter >> 8;
  }

  const hmac = createHmac('sha256', secretKeyBuffer); // SHA-256 for hash algorithm
  hmac.update(buffer);
  const hmacResult: Buffer = hmac.digest();
  const offset: number = hmacResult[hmacResult.length - 1] & 0xf;
  const code: number =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  return `${code % 10 ** 6}`.padStart(6, '0'); // 6 digit code
};

const generateTotp = (dbSecretKey: string, counter: number): string => {
  const secretKeyBuffer = customBase32Decode(dbSecretKey);
  return generateHotp(secretKeyBuffer, counter);
};

interface TotpVerificationInput {
  userTotp: string;
  dbSecretKey: string;
}

export const verifyTotp = async (input: TotpVerificationInput): Promise<boolean> => {
  const { userTotp, dbSecretKey } = input;

  const currentCounter: number = Math.floor(Date.now() / 30000); // 30 seconds interval
  const window: number = 1;
  const serverTotpCurr = generateTotp(dbSecretKey, currentCounter);

  const userTotpBuffer = Buffer.from(userTotp);
  const serverTotpBuffer = Buffer.from(serverTotpCurr);

  if (userTotpBuffer.length !== serverTotpBuffer.length) {
    return false;
  }

  if (timingSafeEqual(userTotpBuffer, serverTotpBuffer)) {
    return true;
  }

  // In case of clock drift or the user enters a code right at the end of the period, accept the previous and next TOTP as well
  // NIST allows up to a 2 min interval (this being 3 x 30 s intervals)

  for (let errorWindow = 1; errorWindow <= window; errorWindow++) {
    const serverTotpPrev = generateTotp(dbSecretKey, currentCounter - errorWindow);
    const serverTotpNext = generateTotp(dbSecretKey, currentCounter + errorWindow);

    const serverTotpPrevBuffer = Buffer.from(serverTotpPrev);
    const serverTotpNextBuffer = Buffer.from(serverTotpNext);

    if (
      userTotpBuffer.length === serverTotpPrevBuffer.length &&
      timingSafeEqual(userTotpBuffer, serverTotpPrevBuffer)
    ) {
      return true;
    }

    if (
      userTotpBuffer.length === serverTotpNextBuffer.length &&
      timingSafeEqual(userTotpBuffer, serverTotpNextBuffer)
    ) {
      return true;
    }
  }

  return false;
}

// The user may want to use the raw base32 encoded secret key instead of a TOTP...
// eg. if they don't have access to their authenticator app  or browser extension to scan the QR code (or they feel like it)

export const verifySecretKey = async (
  {
    userSecretKey,
    dbSecretKey,
  }: {
    userSecretKey: string;
    dbSecretKey: string;
  }
): Promise<boolean> => {
  try {
    const userSecretKeyBuffer = customBase32Decode(userSecretKey);
    const dbSecretKeyBuffer = customBase32Decode(dbSecretKey);

    if (userSecretKeyBuffer.length !== dbSecretKeyBuffer.length) {
      return false;
    }

    const isEqual = timingSafeEqual(userSecretKeyBuffer, dbSecretKeyBuffer);
    return isEqual;
  } catch (err) {
    console.error("Error verifying secret keys:", err);
    return false;
  }
};

// This implementation follows RFC 6238 >>> TOTP: Time-Based One-Time Password Algorithm
// Read all about it here: https://datatracker.ietf.org/doc/html/rfc6238

// SHA-256 is used as the hash algorithm due to NIST requirements (this ensures FIPS compatibility)
// Most major apps do however as SHA-1 gets deprecated for secure crypto operations
// There is no need to implement SHA-512 here (until NIST updates guidance)

// NB. not all authenticator apps support SHA-256 in 2023
// Here is an updated list (March 2023) showing support: 
// https://labanskoller.se/blog/2023/03/16/mobile-authenticator-apps-algorithm-support-review-2023-edition/

// Authenticator apps that are compatible with Infisical //

// Android & iOS //
// Bitwarden Password Manager (requires premium account), Dashlane Authenticator, LastPass Authenticator, Oracle Mobile Authenticator, Salesforce Authenticator, Sophos Authenticator, Yubico Authenticator

// Android ONLY //
// Aegis

// iOS ONLY //
// Google Authenticator (NOT on Android...), Okta Verify, Raivo OTP

// RFC 4226 >>> HOTP: An HMAC-Based One-Time Password Algorithm
// Read all about it here:  https://datatracker.ietf.org/doc/html/rfc4226

// A 6-digit code is normal and integrates with all major auth apps
// This could be increased (eg. to 9) in the future
// Or this could be enabled as an optional feature as NIST requirements evolve or if an org requires it

// 30 s period is normal & is the default/only time period setting for all major authenticator apps
// NIST requires max 2 min period