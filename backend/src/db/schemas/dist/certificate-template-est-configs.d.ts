/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const CertificateTemplateEstConfigsSchema: z.ZodObject<{
    id: z.ZodString;
    certificateTemplateId: z.ZodString;
    encryptedCaChain: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    hashedPassphrase: z.ZodString;
    isEnabled: z.ZodBoolean;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    disableBootstrapCertValidation: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    isEnabled: boolean;
    certificateTemplateId: string;
    hashedPassphrase: string;
    disableBootstrapCertValidation: boolean;
    encryptedCaChain?: Buffer | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    isEnabled: boolean;
    certificateTemplateId: string;
    hashedPassphrase: string;
    encryptedCaChain?: Buffer | null | undefined;
    disableBootstrapCertValidation?: boolean | undefined;
}>;
export type TCertificateTemplateEstConfigs = z.infer<typeof CertificateTemplateEstConfigsSchema>;
export type TCertificateTemplateEstConfigsInsert = Omit<z.input<typeof CertificateTemplateEstConfigsSchema>, TImmutableDBKeys>;
export type TCertificateTemplateEstConfigsUpdate = Partial<Omit<z.input<typeof CertificateTemplateEstConfigsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=certificate-template-est-configs.d.ts.map