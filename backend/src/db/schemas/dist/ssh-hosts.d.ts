import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SshHostsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    projectId: z.ZodString;
    hostname: z.ZodString;
    userCertTtl: z.ZodString;
    hostCertTtl: z.ZodString;
    userSshCaId: z.ZodString;
    hostSshCaId: z.ZodString;
    alias: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    hostname: string;
    userCertTtl: string;
    hostCertTtl: string;
    userSshCaId: string;
    hostSshCaId: string;
    alias?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    hostname: string;
    userCertTtl: string;
    hostCertTtl: string;
    userSshCaId: string;
    hostSshCaId: string;
    alias?: string | null | undefined;
}>;
export type TSshHosts = z.infer<typeof SshHostsSchema>;
export type TSshHostsInsert = Omit<z.input<typeof SshHostsSchema>, TImmutableDBKeys>;
export type TSshHostsUpdate = Partial<Omit<z.input<typeof SshHostsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ssh-hosts.d.ts.map