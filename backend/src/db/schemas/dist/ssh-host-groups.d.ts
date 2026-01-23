import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SshHostGroupsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    projectId: z.ZodString;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
}>;
export type TSshHostGroups = z.infer<typeof SshHostGroupsSchema>;
export type TSshHostGroupsInsert = Omit<z.input<typeof SshHostGroupsSchema>, TImmutableDBKeys>;
export type TSshHostGroupsUpdate = Partial<Omit<z.input<typeof SshHostGroupsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ssh-host-groups.d.ts.map