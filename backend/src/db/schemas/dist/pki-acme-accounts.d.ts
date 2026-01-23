import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiAcmeAccountsSchema: z.ZodObject<{
    id: z.ZodString;
    profileId: z.ZodString;
    emails: z.ZodArray<z.ZodString, "many">;
    publicKey: z.ZodUnknown;
    publicKeyThumbprint: z.ZodString;
    alg: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    profileId: string;
    emails: string[];
    publicKeyThumbprint: string;
    alg: string;
    publicKey?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    profileId: string;
    emails: string[];
    publicKeyThumbprint: string;
    alg: string;
    publicKey?: unknown;
}>;
export type TPkiAcmeAccounts = z.infer<typeof PkiAcmeAccountsSchema>;
export type TPkiAcmeAccountsInsert = Omit<z.input<typeof PkiAcmeAccountsSchema>, TImmutableDBKeys>;
export type TPkiAcmeAccountsUpdate = Partial<Omit<z.input<typeof PkiAcmeAccountsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-acme-accounts.d.ts.map