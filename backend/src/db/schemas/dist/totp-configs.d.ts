/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const TotpConfigsSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    isVerified: z.ZodDefault<z.ZodBoolean>;
    encryptedRecoveryCodes: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedSecret: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    encryptedSecret: Buffer;
    isVerified: boolean;
    encryptedRecoveryCodes: Buffer;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    encryptedSecret: Buffer;
    encryptedRecoveryCodes: Buffer;
    isVerified?: boolean | undefined;
}>;
export type TTotpConfigs = z.infer<typeof TotpConfigsSchema>;
export type TTotpConfigsInsert = Omit<z.input<typeof TotpConfigsSchema>, TImmutableDBKeys>;
export type TTotpConfigsUpdate = Partial<Omit<z.input<typeof TotpConfigsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=totp-configs.d.ts.map