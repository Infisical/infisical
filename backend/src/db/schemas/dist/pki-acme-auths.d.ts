import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiAcmeAuthsSchema: z.ZodObject<{
    id: z.ZodString;
    accountId: z.ZodString;
    status: z.ZodString;
    token: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    identifierType: z.ZodString;
    identifierValue: z.ZodString;
    expiresAt: z.ZodDate;
    certificateId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    expiresAt: Date;
    accountId: string;
    identifierType: string;
    identifierValue: string;
    certificateId?: string | null | undefined;
    token?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    expiresAt: Date;
    accountId: string;
    identifierType: string;
    identifierValue: string;
    certificateId?: string | null | undefined;
    token?: string | null | undefined;
}>;
export type TPkiAcmeAuths = z.infer<typeof PkiAcmeAuthsSchema>;
export type TPkiAcmeAuthsInsert = Omit<z.input<typeof PkiAcmeAuthsSchema>, TImmutableDBKeys>;
export type TPkiAcmeAuthsUpdate = Partial<Omit<z.input<typeof PkiAcmeAuthsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-acme-auths.d.ts.map