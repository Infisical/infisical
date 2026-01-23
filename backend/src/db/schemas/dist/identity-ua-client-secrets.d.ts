import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityUaClientSecretsSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodString;
    clientSecretPrefix: z.ZodString;
    clientSecretHash: z.ZodString;
    clientSecretLastUsedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    clientSecretNumUses: z.ZodDefault<z.ZodNumber>;
    clientSecretNumUsesLimit: z.ZodDefault<z.ZodNumber>;
    clientSecretTTL: z.ZodDefault<z.ZodNumber>;
    isClientSecretRevoked: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    identityUAId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    description: string;
    clientSecretPrefix: string;
    clientSecretHash: string;
    clientSecretNumUses: number;
    clientSecretNumUsesLimit: number;
    clientSecretTTL: number;
    isClientSecretRevoked: boolean;
    identityUAId: string;
    clientSecretLastUsedAt?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    description: string;
    clientSecretPrefix: string;
    clientSecretHash: string;
    identityUAId: string;
    clientSecretLastUsedAt?: Date | null | undefined;
    clientSecretNumUses?: number | undefined;
    clientSecretNumUsesLimit?: number | undefined;
    clientSecretTTL?: number | undefined;
    isClientSecretRevoked?: boolean | undefined;
}>;
export type TIdentityUaClientSecrets = z.infer<typeof IdentityUaClientSecretsSchema>;
export type TIdentityUaClientSecretsInsert = Omit<z.input<typeof IdentityUaClientSecretsSchema>, TImmutableDBKeys>;
export type TIdentityUaClientSecretsUpdate = Partial<Omit<z.input<typeof IdentityUaClientSecretsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-ua-client-secrets.d.ts.map