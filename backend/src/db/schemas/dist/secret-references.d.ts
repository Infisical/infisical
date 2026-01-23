import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretReferencesSchema: z.ZodObject<{
    id: z.ZodString;
    environment: z.ZodString;
    secretPath: z.ZodString;
    secretId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    environment: string;
    secretPath: string;
    secretId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    environment: string;
    secretPath: string;
    secretId: string;
}>;
export type TSecretReferences = z.infer<typeof SecretReferencesSchema>;
export type TSecretReferencesInsert = Omit<z.input<typeof SecretReferencesSchema>, TImmutableDBKeys>;
export type TSecretReferencesUpdate = Partial<Omit<z.input<typeof SecretReferencesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-references.d.ts.map