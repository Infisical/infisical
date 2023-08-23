import axios from "axios";
import { createHash } from "crypto"; // added types from @types/node

  // see API details here: https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
  // in short, the pending password is hashed (SHA-1), the first 5 chars are sliced and compared against a ranged hash table
  // this hash table is formed from the 5 char hash prefix (ie. 00000-FFFFF) so 16^5 results
  // returns a hash table of 800-1000 results
  // padding has been added to prevent MiTM attacker determining which hash table was called by the response size
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

export const checkIsPasswordBreached = async (password: string) => {
  const dataBreachCheckAPIBaseURL = "https://api.pwnedpasswords.com/range/"; // added to CSP
  const maxRetryAttempts = 3;

  try {
    const textEncoder = new TextEncoder();
    const encodedPwd = textEncoder.encode(password);
    const hash = createHash("sha1").update(encodedPwd).digest();
    const hashedPwd = hash.toString("hex").toUpperCase();
    const hashedPwdToSend = hashedPwd.slice(0, 5); // ONLY the first five hash chars are sent
    const rangedHashTableUri = `${dataBreachCheckAPIBaseURL}${hashedPwdToSend}`;
    
    let response;
    let retryAttempt = 0;

    while (retryAttempt < maxRetryAttempts) {
      try {
        response = await axios.get(rangedHashTableUri, {
          headers: {
            "Add-Padding": "true", // see https://www.troyhunt.com/enhancing-pwned-passwords-privacy-with-padding/
            "Content-Type": "text/plain",
          },
        });

        if (response.status === 200) {
          break;
        } else {
          retryAttempt++;
        }
      } catch (err) {
        if (!axios.isAxiosError(err)) {
          throw err;
        }
        retryAttempt++;
      }
    }

    if (response && response.status === 200) {
      const responseData = response.data.toUpperCase();
      // compare last 35 hash chars to the returned ranged hash table
      // returns a boolean: true indicates the password has been involved in a data breach (ie. pwnd)
      const isBreachedPassword = responseData.includes(hashedPwd.slice(5, 40));

      // Clear the hashed password from memory as a precaution
      const zeroBuffer = new Uint8Array(encodedPwd.length);
      encodedPwd.set(zeroBuffer);

      return isBreachedPassword;
    }

    console.error(
      `Received a non-200 response (${response ? response.status : "unknown"}) from the Pwnd Passwords API`
    );
    return false; // better to return a safe response if no breach can be determined
  } catch (err: any) {
    console.error("An unexpected error has occurred:", err.message);
    return false; // Return a safe response in case of unexpected errors 
    // the HIBP API could return 400 (empty string supplied), 429 or 503 if Cloudflare edge node is down)
  }
};
