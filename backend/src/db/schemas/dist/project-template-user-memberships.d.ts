import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectTemplateUserMembershipsSchema: z.ZodObject<{
    id: z.ZodString;
    projectTemplateId: z.ZodString;
    membershipId: z.ZodString;
    roles: z.ZodArray<z.ZodString, "many">;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    roles: string[];
    id: string;
    createdAt: Date;
    updatedAt: Date;
    membershipId: string;
    projectTemplateId: string;
}, {
    roles: string[];
    id: string;
    createdAt: Date;
    updatedAt: Date;
    membershipId: string;
    projectTemplateId: string;
}>;
export type TProjectTemplateUserMemberships = z.infer<typeof ProjectTemplateUserMembershipsSchema>;
export type TProjectTemplateUserMembershipsInsert = Omit<z.input<typeof ProjectTemplateUserMembershipsSchema>, TImmutableDBKeys>;
export type TProjectTemplateUserMembershipsUpdate = Partial<Omit<z.input<typeof ProjectTemplateUserMembershipsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-template-user-memberships.d.ts.map