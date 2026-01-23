import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiAcmeOrdersSchema: z.ZodObject<{
    id: z.ZodString;
    accountId: z.ZodString;
    certificateId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notBefore: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    notAfter: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    expiresAt: z.ZodDate;
    csr: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    error: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    expiresAt: Date;
    accountId: string;
    certificateId?: string | null | undefined;
    csr?: string | null | undefined;
    notBefore?: Date | null | undefined;
    notAfter?: Date | null | undefined;
    error?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    expiresAt: Date;
    accountId: string;
    certificateId?: string | null | undefined;
    csr?: string | null | undefined;
    notBefore?: Date | null | undefined;
    notAfter?: Date | null | undefined;
    error?: string | null | undefined;
}>;
export type TPkiAcmeOrders = z.infer<typeof PkiAcmeOrdersSchema>;
export type TPkiAcmeOrdersInsert = Omit<z.input<typeof PkiAcmeOrdersSchema>, TImmutableDBKeys>;
export type TPkiAcmeOrdersUpdate = Partial<Omit<z.input<typeof PkiAcmeOrdersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-acme-orders.d.ts.map