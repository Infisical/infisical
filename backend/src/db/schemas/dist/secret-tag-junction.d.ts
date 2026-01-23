import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretTagJunctionSchema: z.ZodObject<{
    id: z.ZodString;
    secretsId: z.ZodString;
    secret_tagsId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    secretsId: string;
    secret_tagsId: string;
}, {
    id: string;
    secretsId: string;
    secret_tagsId: string;
}>;
export type TSecretTagJunction = z.infer<typeof SecretTagJunctionSchema>;
export type TSecretTagJunctionInsert = Omit<z.input<typeof SecretTagJunctionSchema>, TImmutableDBKeys>;
export type TSecretTagJunctionUpdate = Partial<Omit<z.input<typeof SecretTagJunctionSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-tag-junction.d.ts.map