import axios from "axios";
import crypto from "crypto"; // added types from @types/node

export const checkIsPasswordBreached = async (password: string) => {
  // see API details here: https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
  // in short, the pending password is hashed (SHA-1), fist 5 chars are sliced and compared against a ranged hash table
  // if there is a match, that password has been involved in a password breach and should not be accepted

  // the database consists of ~700 mln breached passwords and is continuously being updated including with data from the FBI & the UK's NCA
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

    // Ensure that ONLY the first five SHA-1 hash chars are sent over HTTPS
    const response = await axios.get(`${dataBreachCheckAPIBaseURL}${hashedPwd.slice(0, 5)}`);
    const responseData = response.data.toUpperCase();
    const isBreachedPassword = responseData.includes(hashedPwd.slice(5, 40));

    // Clear the hashed password from memory (good practice)
    const zeroBuffer = new Uint8Array(encodedPwd.length);
    encodedPwd.set(zeroBuffer);

    return isBreachedPassword; // boolean
  } catch (err: any) {
    if (axios.isAxiosError(err) && err.response && err.response.status === 429) {
      console.error("Received a 429 response from the Pwnd Passwords API");
      // Handle the 429 error here (not 100% sure what the rate limits are for the password API)
      // an error here should not cause a fail of setting/resetting/changing the password
    } else {
      console.error(err);
    }
  }
};
