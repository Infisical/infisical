import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretVersionV2TagJunctionSchema: z.ZodObject<{
    id: z.ZodString;
    secret_versions_v2Id: z.ZodString;
    secret_tagsId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    secret_tagsId: string;
    secret_versions_v2Id: string;
}, {
    id: string;
    secret_tagsId: string;
    secret_versions_v2Id: string;
}>;
export type TSecretVersionV2TagJunction = z.infer<typeof SecretVersionV2TagJunctionSchema>;
export type TSecretVersionV2TagJunctionInsert = Omit<z.input<typeof SecretVersionV2TagJunctionSchema>, TImmutableDBKeys>;
export type TSecretVersionV2TagJunctionUpdate = Partial<Omit<z.input<typeof SecretVersionV2TagJunctionSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-version-v2-tag-junction.d.ts.map