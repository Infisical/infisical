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
  })
  .refine((data) => data.split(",").length <= 20, {
    message: "You can only select up to 20 slack channels"
  });
