import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectSshConfigsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    projectId: z.ZodString;
    defaultUserSshCaId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    defaultHostSshCaId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    defaultUserSshCaId?: string | null | undefined;
    defaultHostSshCaId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    defaultUserSshCaId?: string | null | undefined;
    defaultHostSshCaId?: string | null | undefined;
}>;
export type TProjectSshConfigs = z.infer<typeof ProjectSshConfigsSchema>;
export type TProjectSshConfigsInsert = Omit<z.input<typeof ProjectSshConfigsSchema>, TImmutableDBKeys>;
export type TProjectSshConfigsUpdate = Partial<Omit<z.input<typeof ProjectSshConfigsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-ssh-configs.d.ts.map