import { z } from "zod";

export const MicrosoftAutoenrollmentParamsSchema = z.object({
  applicationId: z.string().uuid(),
  profileId: z.string().uuid()
});
