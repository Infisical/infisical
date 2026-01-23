import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const UserGroupMembershipSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    groupId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    isPending: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    groupId: string;
    isPending: boolean;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    groupId: string;
    isPending?: boolean | undefined;
}>;
export type TUserGroupMembership = z.infer<typeof UserGroupMembershipSchema>;
export type TUserGroupMembershipInsert = Omit<z.input<typeof UserGroupMembershipSchema>, TImmutableDBKeys>;
export type TUserGroupMembershipUpdate = Partial<Omit<z.input<typeof UserGroupMembershipSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=user-group-membership.d.ts.map