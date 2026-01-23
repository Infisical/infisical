import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectSlackConfigsSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    slackIntegrationId: z.ZodString;
    isAccessRequestNotificationEnabled: z.ZodDefault<z.ZodBoolean>;
    accessRequestChannels: z.ZodDefault<z.ZodString>;
    isSecretRequestNotificationEnabled: z.ZodDefault<z.ZodBoolean>;
    secretRequestChannels: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    isSecretSyncErrorNotificationEnabled: z.ZodDefault<z.ZodBoolean>;
    secretSyncErrorChannels: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    slackIntegrationId: string;
    isAccessRequestNotificationEnabled: boolean;
    accessRequestChannels: string;
    isSecretRequestNotificationEnabled: boolean;
    secretRequestChannels: string;
    isSecretSyncErrorNotificationEnabled: boolean;
    secretSyncErrorChannels: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    slackIntegrationId: string;
    isAccessRequestNotificationEnabled?: boolean | undefined;
    accessRequestChannels?: string | undefined;
    isSecretRequestNotificationEnabled?: boolean | undefined;
    secretRequestChannels?: string | undefined;
    isSecretSyncErrorNotificationEnabled?: boolean | undefined;
    secretSyncErrorChannels?: string | undefined;
}>;
export type TProjectSlackConfigs = z.infer<typeof ProjectSlackConfigsSchema>;
export type TProjectSlackConfigsInsert = Omit<z.input<typeof ProjectSlackConfigsSchema>, TImmutableDBKeys>;
export type TProjectSlackConfigsUpdate = Partial<Omit<z.input<typeof ProjectSlackConfigsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-slack-configs.d.ts.map