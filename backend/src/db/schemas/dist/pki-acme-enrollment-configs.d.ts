/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiAcmeEnrollmentConfigsSchema: z.ZodObject<{
    id: z.ZodString;
    encryptedEabSecret: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    skipDnsOwnershipVerification: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedEabSecret: Buffer;
    skipDnsOwnershipVerification: boolean;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedEabSecret: Buffer;
    skipDnsOwnershipVerification?: boolean | undefined;
}>;
export type TPkiAcmeEnrollmentConfigs = z.infer<typeof PkiAcmeEnrollmentConfigsSchema>;
export type TPkiAcmeEnrollmentConfigsInsert = Omit<z.input<typeof PkiAcmeEnrollmentConfigsSchema>, TImmutableDBKeys>;
export type TPkiAcmeEnrollmentConfigsUpdate = Partial<Omit<z.input<typeof PkiAcmeEnrollmentConfigsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-acme-enrollment-configs.d.ts.map