import axios from "axios";
import crypto from "crypto"; // added types from @types/node

export const checkIsPasswordBreached = async (password: string) => {
  // see API details here: https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
  // in short, the pending password is hashed (SHA-1), the first 5 chars are sliced and compared against a ranged hash table
  // if there is a match, that password has been involved in a password breach and should NOT be accepted

  // the database consists of ~700 mln breached passwords and is continuously updated, including with law enforcement ingestion
  // https://www.troyhunt.com/open-source-pwned-passwords-with-fbi-feed-and-225m-new-nca-passwords-is-now-live/

  const dataBreachCheckAPIBaseURL = "https://api.pwnedpasswords.com/range/"; // added to CSP

  try {
    const textEncoder = new TextEncoder();
    const encodedPwd = textEncoder.encode(password);
    const hash = crypto.createHash("sha1").update(encodedPwd).digest();

    const hashedPwd = Array.from(new Uint8Array(hash))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    // ONLY the first five SHA-1 hash chars need to be sent (must be over HTTPS)
    const hashedPwdToSend = hashedPwd.slice(0, 5);

    const response = await axios.get(`${dataBreachCheckAPIBaseURL}${hashedPwdToSend}`);
    const responseData = response.data.toUpperCase();

    // compare against the API's ranged db's hash table
    const isBreachedPassword = responseData.includes(hashedPwd.slice(5, 40));

    // Clear the hashed password from memory as a precaution
    const zeroBuffer = new Uint8Array(encodedPwd.length);
    encodedPwd.set(zeroBuffer);

    return isBreachedPassword; // boolean: true indicates the password has been involved in a data breach
  } catch (err: any) {
    if (axios.isAxiosError(err) && err.response && err.response.status === 429) {
      console.error("Received a 429 response from the Pwnd Passwords API");
      // Handle the 429 error here (not 100% sure what the rate limits are for the password API but looks like <10 calls/min)
      // an error here should probably not cause the setting/resetting/changing password to fail (unless desired)
    } else {
      console.error(err);
    }
  }
};
