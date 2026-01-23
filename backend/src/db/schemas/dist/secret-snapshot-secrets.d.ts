import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretSnapshotSecretsSchema: z.ZodObject<{
    id: z.ZodString;
    envId: z.ZodString;
    secretVersionId: z.ZodString;
    snapshotId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    envId: string;
    secretVersionId: string;
    snapshotId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    envId: string;
    secretVersionId: string;
    snapshotId: string;
}>;
export type TSecretSnapshotSecrets = z.infer<typeof SecretSnapshotSecretsSchema>;
export type TSecretSnapshotSecretsInsert = Omit<z.input<typeof SecretSnapshotSecretsSchema>, TImmutableDBKeys>;
export type TSecretSnapshotSecretsUpdate = Partial<Omit<z.input<typeof SecretSnapshotSecretsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-snapshot-secrets.d.ts.map