import { z } from "zod";

export interface ConsumerSecretRaw {
    organization: string,
    user: string,
    plaintextSecret: string,
}

export const ConsumerSecretRawSchema = z.object({
    organization: z.string(),
    user: z.string(),
    plaintextSecret: z.string(),
});