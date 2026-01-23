import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const BackupPrivateKeySchema: z.ZodObject<{
    id: z.ZodString;
    encryptedPrivateKey: z.ZodString;
    iv: z.ZodString;
    tag: z.ZodString;
    algorithm: z.ZodString;
    keyEncoding: z.ZodString;
    salt: z.ZodString;
    verifier: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    userId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    encryptedPrivateKey: string;
    iv: string;
    tag: string;
    algorithm: string;
    keyEncoding: string;
    salt: string;
    verifier: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    encryptedPrivateKey: string;
    iv: string;
    tag: string;
    algorithm: string;
    keyEncoding: string;
    salt: string;
    verifier: string;
}>;
export type TBackupPrivateKey = z.infer<typeof BackupPrivateKeySchema>;
export type TBackupPrivateKeyInsert = Omit<z.input<typeof BackupPrivateKeySchema>, TImmutableDBKeys>;
export type TBackupPrivateKeyUpdate = Partial<Omit<z.input<typeof BackupPrivateKeySchema>, TImmutableDBKeys>>;
//# sourceMappingURL=backup-private-key.d.ts.map