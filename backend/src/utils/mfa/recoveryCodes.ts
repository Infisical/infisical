import { randomBytes } from "crypto";
import { promisify } from "util";
import { customBase32Encode } from "./base32EncodeAndDecode"

interface RecoveryCodesParams {
  number: number;
  bytes: number;
}

const recCodesParams: RecoveryCodesParams = Object.freeze({
  number: 8, // balance of usability & security
  bytes: 6, // (6*8) bits / 5 bits/char = 9.6 chars =~ 10 chars in base32) (GitHub uses 10 chars encoded as base32)
});

const randomBytesPromise = promisify(randomBytes);

const genRandomCode = async (): Promise<string> => {
  try {
    const randomBytesData = await randomBytesPromise(recCodesParams.bytes);
    const secret = customBase32Encode(randomBytesData);
    const middleIndex = Math.floor(secret.length / 2);
    const formattedCode = `${secret.slice(0, middleIndex)}-${secret.slice(middleIndex)}`;
    return formattedCode;
  } catch (err) {
    throw new Error("Failed to generate random code");
  }
};

export const createRecoveryCodes = async (): Promise<string[]> => {
  try {
    const recoveryCodes: string[] = [];

    for (let i = 0; i < recCodesParams.number; i++) {
      const randomCode = await genRandomCode();
      recoveryCodes.push(randomCode);
    }

    return recoveryCodes;
  } catch (err) {
    throw new Error("Failed to create recovery codes");
  }
};

// Review of Recovery Codes (Sept 2023) //

// Entropy = log2(Number of Possible Combinations)

// Provider    // Number // Encoding // Chars // Bits  // Entropy // Example       
// ---------------------------------------------------------------------------------------
// Infisical   // 8      // Base32   // 10     // 50    // 3.169   // 5ce3f-6b8c2   
// GitHub      // 16     // Base32   // 10     // 50    // 3.169   // b739a-26c5b   
// FormSpree   // 10     // Base32   // 10     // 50    // 3.169   // vly5g8euza    
// Google      // 10     // Base10   // 8      // 32    // 2.000   // 3729 3098     
// Render      // 8      // Base10   // 8      // 32    // 2.000   // 20254996      
// Netlify     // 10     // Base10   // 10     // 32    // 3.321   // nkkt7-kx4sd   
// LinkedIn    // 5      // Base10   // 8      // 32    // 2.000   // 76691789      
// Facebook    // 5      // Base10   // 8      // 32    // 2.000   // 7836 9332     
// Bitwarden   // 8      // Base36   // 4      // 18    // 1.000   // X6OZ