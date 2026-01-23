import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiAcmeChallengesSchema: z.ZodObject<{
    id: z.ZodString;
    authId: z.ZodString;
    type: z.ZodString;
    status: z.ZodString;
    error: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    validatedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    status: string;
    authId: string;
    error?: string | null | undefined;
    validatedAt?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    status: string;
    authId: string;
    error?: string | null | undefined;
    validatedAt?: Date | null | undefined;
}>;
export type TPkiAcmeChallenges = z.infer<typeof PkiAcmeChallengesSchema>;
export type TPkiAcmeChallengesInsert = Omit<z.input<typeof PkiAcmeChallengesSchema>, TImmutableDBKeys>;
export type TPkiAcmeChallengesUpdate = Partial<Omit<z.input<typeof PkiAcmeChallengesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-acme-challenges.d.ts.map