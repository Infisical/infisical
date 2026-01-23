import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SshHostLoginUsersSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    sshHostId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    loginUser: z.ZodString;
    sshHostGroupId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    loginUser: string;
    sshHostId?: string | null | undefined;
    sshHostGroupId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    loginUser: string;
    sshHostId?: string | null | undefined;
    sshHostGroupId?: string | null | undefined;
}>;
export type TSshHostLoginUsers = z.infer<typeof SshHostLoginUsersSchema>;
export type TSshHostLoginUsersInsert = Omit<z.input<typeof SshHostLoginUsersSchema>, TImmutableDBKeys>;
export type TSshHostLoginUsersUpdate = Partial<Omit<z.input<typeof SshHostLoginUsersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ssh-host-login-users.d.ts.map