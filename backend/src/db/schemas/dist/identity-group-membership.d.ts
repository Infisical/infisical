import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityGroupMembershipSchema: z.ZodObject<{
    id: z.ZodString;
    identityId: z.ZodString;
    groupId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    groupId: string;
    identityId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    groupId: string;
    identityId: string;
}>;
export type TIdentityGroupMembership = z.infer<typeof IdentityGroupMembershipSchema>;
export type TIdentityGroupMembershipInsert = Omit<z.input<typeof IdentityGroupMembershipSchema>, TImmutableDBKeys>;
export type TIdentityGroupMembershipUpdate = Partial<Omit<z.input<typeof IdentityGroupMembershipSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-group-membership.d.ts.map