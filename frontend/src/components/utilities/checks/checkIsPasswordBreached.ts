import axios from "axios";
import crypto from "crypto"; // added types from @types/node

export const checkIsPasswordBreached = async (password: string) => {
  const dataBreachCheckAPIBaseURL = "https://api.pwnedpasswords.com/range/";
  try {
    const textEncoder = new TextEncoder();
    const encodedPwd = textEncoder.encode(password);
    const hash = crypto.createHash("sha1").update(encodedPwd).digest();

    const hashedPwd = Array.from(new Uint8Array(hash))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    const response = await axios.get(`${dataBreachCheckAPIBaseURL}${hashedPwd.slice(0, 5)}`);
    console.log("response:", response); // delete later!!!

    const responseData = response.data.toUpperCase();
    console.log("responseData:", responseData); // delete later!!!

    const isBreachedPassword = responseData.includes(hashedPwd.slice(5, 40));
    console.log("isBreachedPassword:", isBreachedPassword); // delete later!!!

    // Clear the hashed password from memory
    const zeroBuffer = new Uint8Array(encodedPwd.length);
    encodedPwd.set(zeroBuffer);

    return isBreachedPassword;
  } catch (err: any) {
    if (axios.isAxiosError(err) && err.response && err.response.status === 429) {
      console.error("Received a 429 response from the Pwnd Passwords API");
      // Handle the 429 error here
    } else {
      console.error(err);
    }
  }
};
