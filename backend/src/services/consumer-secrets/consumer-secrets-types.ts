import { z } from "zod";

export interface ConsumerSecretRaw {
    id: string,
    organization: string,
    user: string,
    plaintextSecret: string,
}

export const ConsumerSecretRawSchema = z.object({
    id: z.string().uuid(),
    organization: z.string(),
    user: z.string(),
    plaintextSecret: z.string(),
});