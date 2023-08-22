import axios from "axios";
import crypto from "crypto";

///// REMINDER: ensure all logs are deleted!!! /////

export const checkIsPasswordBreached = async (password: string) => {
  const dataBreachCheckAPIBaseURL = "https://api.pwnedpasswords.com/range/";
  try {
    const textEncoder = new TextEncoder();

    const encodedPwd = textEncoder.encode(password);
    console.log("encodedPwd:", encodedPwd); // delete later!!!

    const hashBuffer = await crypto.subtle.digest("SHA-1", encodedPwd);
    console.log("hashBuffer:", hashBuffer); // delete later!!!

    const hashedPwd = Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    console.log("hashedPwd:", hashedPwd); // delete later!!!

    const response = await axios.get(
      `${dataBreachCheckAPIBaseURL}${hashedPwd.slice(0, 5)}`
    );
    console.log("response:", response); // delete later!!!

    const responseData = response.data.toUpperCase();
    console.log("responseData:", responseData); // delete later!!!

    const isBreachedPassword = responseData.includes(hashedPwd.slice(5, 40));
    console.log("isBreachedPassword:", isBreachedPassword); // delete later!!!

    // Clear the hashed password from memory
    crypto.subtle.digest("SHA-1", encodedPwd);

    return isBreachedPassword;
  } catch (err: any) {
    if (
      axios.isAxiosError(err) &&
      err.response &&
      err.response.status === 429
    ) {
      console.error("Received a 429 response from the Pwnd Passwords API");
      // Handle the 429 error here
    } else {
      console.error(err);
    }
  }
};
