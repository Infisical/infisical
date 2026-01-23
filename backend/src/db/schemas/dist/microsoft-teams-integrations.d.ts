/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const MicrosoftTeamsIntegrationsSchema: z.ZodObject<{
    id: z.ZodString;
    internalTeamsAppId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    tenantId: z.ZodString;
    encryptedAccessToken: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    encryptedBotAccessToken: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    accessTokenExpiresAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    botAccessTokenExpiresAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    internalTeamsAppId?: string | null | undefined;
    encryptedAccessToken?: Buffer | null | undefined;
    encryptedBotAccessToken?: Buffer | null | undefined;
    accessTokenExpiresAt?: Date | null | undefined;
    botAccessTokenExpiresAt?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    internalTeamsAppId?: string | null | undefined;
    encryptedAccessToken?: Buffer | null | undefined;
    encryptedBotAccessToken?: Buffer | null | undefined;
    accessTokenExpiresAt?: Date | null | undefined;
    botAccessTokenExpiresAt?: Date | null | undefined;
}>;
export type TMicrosoftTeamsIntegrations = z.infer<typeof MicrosoftTeamsIntegrationsSchema>;
export type TMicrosoftTeamsIntegrationsInsert = Omit<z.input<typeof MicrosoftTeamsIntegrationsSchema>, TImmutableDBKeys>;
export type TMicrosoftTeamsIntegrationsUpdate = Partial<Omit<z.input<typeof MicrosoftTeamsIntegrationsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=microsoft-teams-integrations.d.ts.map