import { randomBytes } from "crypto";
import { promisify } from "util";

import { MFA_RECOVERY_CODES_PARAMS } from "../../variables";
import { customBase32Encode } from "./base32EncodeAndDecode"

const randomBytesPromise = promisify(randomBytes);

const calculateEntropy = (str: string): number => {
  const uniqueCharacters = [...new Set(str)].join("");
  return Math.log2(uniqueCharacters.length);
};

const genRandomCode = async (): Promise<string> => {
  try {
    let randomCode = "";
    let entropy = 0;

    while (entropy < MFA_RECOVERY_CODES_PARAMS.min_entropy) {
      const randomBytesData = await randomBytesPromise(MFA_RECOVERY_CODES_PARAMS.bytes);
      // encode as base32 for better readability and prevent user mistakes (NB. all letters are capitalized)
      const secret = customBase32Encode(randomBytesData);
      randomCode = `${secret}`;
      // ensure the entropy of each code is above a minimum threshold
      entropy = calculateEntropy(randomCode);
    }

    // format each code to be more readable for the user
    const middleIndex = Math.floor(randomCode.length / 2);
    const formattedCode = `${randomCode.slice(0, middleIndex)}-${randomCode.slice(middleIndex)}`;
    return formattedCode;
  } catch (err) {
    throw new Error("Failed to generate random code");
  }
};

export const createMfaRecoveryCodes = async (): Promise<string[]> => {
  try {
    const recoveryCodes: Set<string> = new Set();

    // only add recovery codes that are unique
    while (recoveryCodes.size < MFA_RECOVERY_CODES_PARAMS.number) {
      const randomCode = await genRandomCode();
      
      if (!recoveryCodes.has(randomCode)) {
        recoveryCodes.add(randomCode);
      }
    }

    return [...recoveryCodes];
  } catch (err) {
    throw new Error("Failed to create recovery codes");
  }
};


// Review of Recovery Codes (Sept 2023) //

// Entropy = log2(Number of Possible Combinations)

// Provider    // Number // Encoding // Chars // Bits  // Entropy // Example       
// ---------------------------------------------------------------------------------------
// Infisical   // 8      // Base32   // 10     // 50    // 3.169   // EKOEM-KR5LU   
// GitHub      // 16     // Base32   // 10     // 50    // 3.169   // b739a-26c5b   
// FormSpree   // 10     // Base32   // 10     // 50    // 3.169   // vly5g8euza    
// Google      // 10     // Base10   // 8      // 32    // 2.000   // 3729 3098     
// Render      // 8      // Base10   // 8      // 32    // 2.000   // 20254996      
// Netlify     // 10     // Base10   // 10     // 32    // 3.321   // nkkt7-kx4sd   
// LinkedIn    // 5      // Base10   // 8      // 32    // 2.000   // 76691789      
// Facebook    // 5      // Base10   // 8      // 32    // 2.000   // 7836 9332     
// Bitwarden   // 8      // Base36   // 4      // 18    // 1.000   // X6OZ

// Example Infisical MFA recovery codes
// 67M2Y-OCOTY
// THJI6-REP5Q
// ATAWW-3OSAE
// A42PX-ZNAM4
// HUI3T-GRPLI
// LBA7Z-5WUTY
// EKOEM-KR5LU
// YP4W7-KJ3JI