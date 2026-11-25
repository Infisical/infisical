import { z } from "zod";

export const MicrosoftAutoenrollmentParamsSchema = z.object({
  applicationId: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  profileId: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase())
});
