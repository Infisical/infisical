import axios from "axios";

// SHA-1 hash the password using the SubtleCrypto API
async function hashPassword(passwordBytes: ArrayBuffer): Promise<ArrayBuffer> {
  const buffer = await window.crypto.subtle.digest("SHA-1", passwordBytes);
  return buffer;
}

// Convert the hashed password buffer to a hexadecimal string
function bufferToHex(buffer: ArrayBuffer): string {
  const byteArray = new Uint8Array(buffer);
  const hexParts: string[] = [];
  byteArray.forEach((byte) => {
    const hex = byte.toString(16).padStart(2, "0");
    hexParts.push(hex);
  });
  return hexParts.join("");
}

  // see API details here: https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
  // in short, the pending password is hashed (SHA-1), the first 5 chars are sliced and compared against a ranged hash table
  // this hash table is formed from the 5 char hash prefix (ie. 00000-FFFFF) so 16^5 results
  // returns a hash table of 800-1000 results
  // padding has been added to prevent MitM attacker determining which hash table was called by the response size
  // the last 35 chars of the password hash are compared client-side against the table
  // if there is a match, that password has been involved in a password breach (ie. pwnd) and should NOT be accepted
  // the database consists of ~700 mln breached passwords and is continuously updated, including with law enforcement ingestion
  // https://www.troyhunt.com/open-source-pwned-passwords-with-fbi-feed-and-225m-new-nca-passwords-is-now-live/

  // The HIBP API follows NIST guidance (pg.14) https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63b.pdf
  // "When processing requests to establish and change memorized secrets, verifiers SHALL compare
  // the prospective secrets against a list that contains values known to be commonly-used, expected,
  // or compromised. For example, the list MAY include, but is not limited to:
  // • Passwords obtained from previous breach corpuses.
  // • Dictionary words.
  // • Repetitive or sequential characters (e.g. ‘aaaaaa’, ‘1234abcd’).
  // • Context-specific words, such as the name of the service, the username, and derivatives
  //   thereof."

export const checkIsPasswordBreached = async (password: string): Promise<boolean> => {
  const HAVE_I_BEEN_PWNED_API_URL = "https://api.pwnedpasswords.com";
  const maxRetryAttempts = 3;

  let encodedPwd: Uint8Array | undefined;
  let hashedPwdBuffer: ArrayBuffer | undefined;

  try {
    // Convert the password to a Uint8Array (UTF-8 encoded bytes)
    const textEncoder = new TextEncoder();
    encodedPwd = textEncoder.encode(password);

    // Hash the password and convert it to a useful format for the HIBP API
    hashedPwdBuffer = await hashPassword(encodedPwd!.buffer);
    const hashedPwd = bufferToHex(hashedPwdBuffer).toUpperCase();
    // ONLY send the first 5 hash chars (over HTTPS)
    const hashedPwdToSend = hashedPwd.slice(0, 5);
    const safeHashedPwdToSend = encodeURIComponent(hashedPwdToSend); // Ensure URL safety
    const rangedHashTableUri = `${HAVE_I_BEEN_PWNED_API_URL}/range/${safeHashedPwdToSend}`;

    let response;
    let retryAttempt = 0;

    /* eslint-disable no-await-in-loop */
    while (retryAttempt < maxRetryAttempts) {
      try {
        response = await axios.get(rangedHashTableUri, {
          headers: {
            "Add-Padding": "true", // see https://www.troyhunt.com/enhancing-pwned-passwords-privacy-with-padding/
            "Content-Type": "text/plain",
          },
        });

        if (response.status === 200) {
          // now we get back one of 16^5 hash prefix tables with random padding
          const responseData = response.data.toUpperCase();
          // check the last 35 hash chars to see if there's a match
          const isBreachedPassword: boolean = responseData.includes(hashedPwd.slice(5, 40));
          return isBreachedPassword;
        } 
          retryAttempt += 1;
        
      } catch (err) {
        if (!axios.isAxiosError(err)) {
          throw err;
        }
        retryAttempt += 1;
      }
    }

    console.error(
      `Received a non-200 response (${response ? response.status : "unknown"}) from the Pwnd Passwords API`
    );
    return false;
  } catch (err: any) {
    console.error("An unexpected error has occurred:", err.message);
    return false;
  } finally {

    // Clear the UTF-8 encoded password from memory

    if (encodedPwd) {
      const zeroEncodedPwdBuffer = new Uint8Array(encodedPwd.length);
      encodedPwd.set(zeroEncodedPwdBuffer);
    }

    // Clear the hashed password buffer from memory

    if (hashedPwdBuffer) {
      const zeroHashedPwdBuffer = new Uint8Array(hashedPwdBuffer);
      zeroHashedPwdBuffer.fill(0);
    }
  }
};
