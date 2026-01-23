import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretVersionTagJunctionSchema: z.ZodObject<{
    id: z.ZodString;
    secret_versionsId: z.ZodString;
    secret_tagsId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    secret_tagsId: string;
    secret_versionsId: string;
}, {
    id: string;
    secret_tagsId: string;
    secret_versionsId: string;
}>;
export type TSecretVersionTagJunction = z.infer<typeof SecretVersionTagJunctionSchema>;
export type TSecretVersionTagJunctionInsert = Omit<z.input<typeof SecretVersionTagJunctionSchema>, TImmutableDBKeys>;
export type TSecretVersionTagJunctionUpdate = Partial<Omit<z.input<typeof SecretVersionTagJunctionSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-version-tag-junction.d.ts.map