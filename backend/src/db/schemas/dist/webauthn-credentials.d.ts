import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const WebauthnCredentialsSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    credentialId: z.ZodString;
    publicKey: z.ZodString;
    counter: z.ZodDefault<z.ZodNumber>;
    transports: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastUsedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    publicKey: string;
    credentialId: string;
    counter: number;
    name?: string | null | undefined;
    transports?: string[] | null | undefined;
    lastUsedAt?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    publicKey: string;
    credentialId: string;
    name?: string | null | undefined;
    counter?: number | undefined;
    transports?: string[] | null | undefined;
    lastUsedAt?: Date | null | undefined;
}>;
export type TWebauthnCredentials = z.infer<typeof WebauthnCredentialsSchema>;
export type TWebauthnCredentialsInsert = Omit<z.input<typeof WebauthnCredentialsSchema>, TImmutableDBKeys>;
export type TWebauthnCredentialsUpdate = Partial<Omit<z.input<typeof WebauthnCredentialsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=webauthn-credentials.d.ts.map