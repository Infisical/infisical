import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const GitAppOrgSchema: z.ZodObject<{
    id: z.ZodString;
    installationId: z.ZodString;
    userId: z.ZodString;
    orgId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    userId: string;
    installationId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    userId: string;
    installationId: string;
}>;
export type TGitAppOrg = z.infer<typeof GitAppOrgSchema>;
export type TGitAppOrgInsert = Omit<z.input<typeof GitAppOrgSchema>, TImmutableDBKeys>;
export type TGitAppOrgUpdate = Partial<Omit<z.input<typeof GitAppOrgSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=git-app-org.d.ts.map