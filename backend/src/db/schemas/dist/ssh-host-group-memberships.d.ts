import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SshHostGroupMembershipsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    sshHostGroupId: z.ZodString;
    sshHostId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    sshHostId: string;
    sshHostGroupId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    sshHostId: string;
    sshHostGroupId: string;
}>;
export type TSshHostGroupMemberships = z.infer<typeof SshHostGroupMembershipsSchema>;
export type TSshHostGroupMembershipsInsert = Omit<z.input<typeof SshHostGroupMembershipsSchema>, TImmutableDBKeys>;
export type TSshHostGroupMembershipsUpdate = Partial<Omit<z.input<typeof SshHostGroupMembershipsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ssh-host-group-memberships.d.ts.map