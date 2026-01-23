import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityProjectMembershipsSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    identityId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    identityId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    identityId: string;
}>;
export type TIdentityProjectMemberships = z.infer<typeof IdentityProjectMembershipsSchema>;
export type TIdentityProjectMembershipsInsert = Omit<z.input<typeof IdentityProjectMembershipsSchema>, TImmutableDBKeys>;
export type TIdentityProjectMembershipsUpdate = Partial<Omit<z.input<typeof IdentityProjectMembershipsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-project-memberships.d.ts.map