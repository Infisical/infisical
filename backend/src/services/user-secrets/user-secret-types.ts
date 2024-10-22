import { z } from "zod";

import { UserSecretType } from "@app/db/schemas";

export const LoginUserSecretSchema = z.object({
  type: z.literal(UserSecretType.Login),
  username: z.string(),
  password: z.string(),
  websites: z.array(z.string().url()).optional(),
  secretId: z.string().optional()
});

export type TLoginUserSecret = z.infer<typeof LoginUserSecretSchema>;
