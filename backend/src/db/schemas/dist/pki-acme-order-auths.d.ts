import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiAcmeOrderAuthsSchema: z.ZodObject<{
    id: z.ZodString;
    orderId: z.ZodString;
    authId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    authId: string;
    orderId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    authId: string;
    orderId: string;
}>;
export type TPkiAcmeOrderAuths = z.infer<typeof PkiAcmeOrderAuthsSchema>;
export type TPkiAcmeOrderAuthsInsert = Omit<z.input<typeof PkiAcmeOrderAuthsSchema>, TImmutableDBKeys>;
export type TPkiAcmeOrderAuthsUpdate = Partial<Omit<z.input<typeof PkiAcmeOrderAuthsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-acme-order-auths.d.ts.map