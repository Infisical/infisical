import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SshHostLoginUserMappingsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    sshHostLoginUserId: z.ZodString;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    groupId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    sshHostLoginUserId: string;
    userId?: string | null | undefined;
    groupId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    sshHostLoginUserId: string;
    userId?: string | null | undefined;
    groupId?: string | null | undefined;
}>;
export type TSshHostLoginUserMappings = z.infer<typeof SshHostLoginUserMappingsSchema>;
export type TSshHostLoginUserMappingsInsert = Omit<z.input<typeof SshHostLoginUserMappingsSchema>, TImmutableDBKeys>;
export type TSshHostLoginUserMappingsUpdate = Partial<Omit<z.input<typeof SshHostLoginUserMappingsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ssh-host-login-user-mappings.d.ts.map