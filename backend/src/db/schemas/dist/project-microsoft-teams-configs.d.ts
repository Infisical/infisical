import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectMicrosoftTeamsConfigsSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    microsoftTeamsIntegrationId: z.ZodString;
    isAccessRequestNotificationEnabled: z.ZodDefault<z.ZodBoolean>;
    isSecretRequestNotificationEnabled: z.ZodDefault<z.ZodBoolean>;
    accessRequestChannels: z.ZodUnknown;
    secretRequestChannels: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    isAccessRequestNotificationEnabled: boolean;
    isSecretRequestNotificationEnabled: boolean;
    microsoftTeamsIntegrationId: string;
    accessRequestChannels?: unknown;
    secretRequestChannels?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    microsoftTeamsIntegrationId: string;
    isAccessRequestNotificationEnabled?: boolean | undefined;
    accessRequestChannels?: unknown;
    isSecretRequestNotificationEnabled?: boolean | undefined;
    secretRequestChannels?: unknown;
}>;
export type TProjectMicrosoftTeamsConfigs = z.infer<typeof ProjectMicrosoftTeamsConfigsSchema>;
export type TProjectMicrosoftTeamsConfigsInsert = Omit<z.input<typeof ProjectMicrosoftTeamsConfigsSchema>, TImmutableDBKeys>;
export type TProjectMicrosoftTeamsConfigsUpdate = Partial<Omit<z.input<typeof ProjectMicrosoftTeamsConfigsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-microsoft-teams-configs.d.ts.map