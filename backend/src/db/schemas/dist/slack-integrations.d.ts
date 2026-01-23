/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SlackIntegrationsSchema: z.ZodObject<{
    id: z.ZodString;
    teamId: z.ZodString;
    teamName: z.ZodString;
    slackUserId: z.ZodString;
    slackAppId: z.ZodString;
    encryptedBotAccessToken: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    slackBotId: z.ZodString;
    slackBotUserId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    teamId: string;
    encryptedBotAccessToken: Buffer;
    teamName: string;
    slackUserId: string;
    slackAppId: string;
    slackBotId: string;
    slackBotUserId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    teamId: string;
    encryptedBotAccessToken: Buffer;
    teamName: string;
    slackUserId: string;
    slackAppId: string;
    slackBotId: string;
    slackBotUserId: string;
}>;
export type TSlackIntegrations = z.infer<typeof SlackIntegrationsSchema>;
export type TSlackIntegrationsInsert = Omit<z.input<typeof SlackIntegrationsSchema>, TImmutableDBKeys>;
export type TSlackIntegrationsUpdate = Partial<Omit<z.input<typeof SlackIntegrationsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=slack-integrations.d.ts.map