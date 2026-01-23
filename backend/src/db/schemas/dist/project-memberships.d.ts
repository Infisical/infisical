import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectMembershipsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    userId: z.ZodString;
    projectId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    userId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    userId: string;
}>;
export type TProjectMemberships = z.infer<typeof ProjectMembershipsSchema>;
export type TProjectMembershipsInsert = Omit<z.input<typeof ProjectMembershipsSchema>, TImmutableDBKeys>;
export type TProjectMembershipsUpdate = Partial<Omit<z.input<typeof ProjectMembershipsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-memberships.d.ts.map