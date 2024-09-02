import z from "zod";

export const validateSlackChannelsField = z
  .string()
  .trim()
  .default("")
  .transform((data) => {
    if (data === "") return "";
    return data
      .split(",")
      .map((id) => id.trim())
      .join(", ");
  });
