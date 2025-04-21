import RE2 from "re2";
import safe from "safe-regex";
import { z } from "zod";

const twelveDigitRegex = new RE2(/^\d{12}$/);
// akhilmhdh: change this to a normal function later. Checked no redosable at the moment
const arnRegex = new RE2(/^arn:aws:iam::\d{12}:(user\/[a-zA-Z0-9_.@+*/-]+|role\/[a-zA-Z0-9_.@+*/-]+|\*)$/);

export const validateAccountIds = z
  .string()
  .trim()
  .default("")
  // Custom validation to ensure each part is a 12-digit number
  .refine(
    (data) => {
      if (data === "") return true;
      // Split the string by commas to check each supposed number
      const accountIds = data.split(",").map((id) => id.trim());
      // Return true only if every item matches the 12-digit requirement
      return accountIds.every((id) => twelveDigitRegex.test(id));
    },
    {
      message: "Each account ID must be a 12-digit number."
    }
  )
  // Transform the string to normalize space after commas
  .transform((data) => {
    if (data === "") return "";
    // Trim each ID and join with ', ' to ensure formatting
    return data
      .split(",")
      .map((id) => id.trim())
      .join(", ");
  });

export const validatePrincipalArns = z
  .string()
  .trim()
  .default("")
  // Custom validation for ARN format
  .refine(
    (data) => {
      // Skip validation if the string is empty
      if (data === "") return true;
      // Split the string by commas to check each supposed ARN
      const arns = data.split(",");
      // Return true only if every item matches one of the allowed ARN formats
      // and checks whether the provided regex is safe
      return arns.map((el) => el.trim()).every((arn) => safe(`^${arn.replaceAll("*", ".*")}$`) && arnRegex.test(arn));
    },
    {
      message:
        "Each ARN must be in the format of 'arn:aws:iam::123456789012:user/UserName', 'arn:aws:iam::123456789012:role/RoleName', or 'arn:aws:iam::123456789012:*'."
    }
  )
  // Transform to normalize the spaces around commas
  .transform((data) =>
    data
      .split(",")
      .map((arn) => arn.trim())
      .join(", ")
  );
