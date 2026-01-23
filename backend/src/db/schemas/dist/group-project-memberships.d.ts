import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const GroupProjectMembershipsSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    groupId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    groupId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    groupId: string;
}>;
export type TGroupProjectMemberships = z.infer<typeof GroupProjectMembershipsSchema>;
export type TGroupProjectMembershipsInsert = Omit<z.input<typeof GroupProjectMembershipsSchema>, TImmutableDBKeys>;
export type TGroupProjectMembershipsUpdate = Partial<Omit<z.input<typeof GroupProjectMembershipsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=group-project-memberships.d.ts.map