import { z } from "zod";

const authorizationIdSchema = z.string().uuid();

export const AgentVaultOauthCallbackQueryParamsSchema = z.object({
  code: z.string().max(4096).optional().catch(undefined),
  // The ID becomes an API path segment. Reject malformed state before the callback can submit a request.
  state: z
    .string()
    .min(1)
    .max(256)
    .refine((state) => authorizationIdSchema.safeParse(state.split(".")[0]).success)
    .optional()
    .catch(undefined),
  iss: z.string().max(2048).optional().catch(undefined),
  error: z.string().max(1024).optional().catch(undefined),
  error_description: z.string().max(4096).optional().catch(undefined)
});
