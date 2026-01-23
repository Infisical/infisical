import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretV2TagJunctionSchema: z.ZodObject<{
    id: z.ZodString;
    secrets_v2Id: z.ZodString;
    secret_tagsId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    secret_tagsId: string;
    secrets_v2Id: string;
}, {
    id: string;
    secret_tagsId: string;
    secrets_v2Id: string;
}>;
export type TSecretV2TagJunction = z.infer<typeof SecretV2TagJunctionSchema>;
export type TSecretV2TagJunctionInsert = Omit<z.input<typeof SecretV2TagJunctionSchema>, TImmutableDBKeys>;
export type TSecretV2TagJunctionUpdate = Partial<Omit<z.input<typeof SecretV2TagJunctionSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-v2-tag-junction.d.ts.map