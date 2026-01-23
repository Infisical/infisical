import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectTemplateGroupMembershipsSchema: z.ZodObject<{
    id: z.ZodString;
    projectTemplateId: z.ZodString;
    groupId: z.ZodString;
    roles: z.ZodArray<z.ZodString, "many">;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    roles: string[];
    id: string;
    createdAt: Date;
    updatedAt: Date;
    groupId: string;
    projectTemplateId: string;
}, {
    roles: string[];
    id: string;
    createdAt: Date;
    updatedAt: Date;
    groupId: string;
    projectTemplateId: string;
}>;
export type TProjectTemplateGroupMemberships = z.infer<typeof ProjectTemplateGroupMembershipsSchema>;
export type TProjectTemplateGroupMembershipsInsert = Omit<z.input<typeof ProjectTemplateGroupMembershipsSchema>, TImmutableDBKeys>;
export type TProjectTemplateGroupMembershipsUpdate = Partial<Omit<z.input<typeof ProjectTemplateGroupMembershipsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-template-group-memberships.d.ts.map