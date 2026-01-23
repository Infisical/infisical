/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiEstEnrollmentConfigsSchema: z.ZodObject<{
    id: z.ZodString;
    disableBootstrapCaValidation: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    hashedPassphrase: z.ZodString;
    encryptedCaChain: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    hashedPassphrase: string;
    encryptedCaChain?: Buffer | null | undefined;
    disableBootstrapCaValidation?: boolean | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    hashedPassphrase: string;
    encryptedCaChain?: Buffer | null | undefined;
    disableBootstrapCaValidation?: boolean | null | undefined;
}>;
export type TPkiEstEnrollmentConfigs = z.infer<typeof PkiEstEnrollmentConfigsSchema>;
export type TPkiEstEnrollmentConfigsInsert = Omit<z.input<typeof PkiEstEnrollmentConfigsSchema>, TImmutableDBKeys>;
export type TPkiEstEnrollmentConfigsUpdate = Partial<Omit<z.input<typeof PkiEstEnrollmentConfigsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-est-enrollment-configs.d.ts.map