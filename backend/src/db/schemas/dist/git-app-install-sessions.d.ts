import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const GitAppInstallSessionsSchema: z.ZodObject<{
    id: z.ZodString;
    sessionId: z.ZodString;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    orgId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    sessionId: string;
    userId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    sessionId: string;
    userId?: string | null | undefined;
}>;
export type TGitAppInstallSessions = z.infer<typeof GitAppInstallSessionsSchema>;
export type TGitAppInstallSessionsInsert = Omit<z.input<typeof GitAppInstallSessionsSchema>, TImmutableDBKeys>;
export type TGitAppInstallSessionsUpdate = Partial<Omit<z.input<typeof GitAppInstallSessionsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=git-app-install-sessions.d.ts.map