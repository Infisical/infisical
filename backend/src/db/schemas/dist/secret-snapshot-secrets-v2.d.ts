import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretSnapshotSecretsV2Schema: z.ZodObject<{
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
export type TSecretSnapshotSecretsV2 = z.infer<typeof SecretSnapshotSecretsV2Schema>;
export type TSecretSnapshotSecretsV2Insert = Omit<z.input<typeof SecretSnapshotSecretsV2Schema>, TImmutableDBKeys>;
export type TSecretSnapshotSecretsV2Update = Partial<Omit<z.input<typeof SecretSnapshotSecretsV2Schema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-snapshot-secrets-v2.d.ts.map