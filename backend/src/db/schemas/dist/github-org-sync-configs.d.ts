/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const GithubOrgSyncConfigsSchema: z.ZodObject<{
    id: z.ZodString;
    githubOrgName: z.ZodString;
    isActive: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    encryptedGithubOrgAccessToken: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    orgId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    githubOrgName: string;
    isActive?: boolean | null | undefined;
    encryptedGithubOrgAccessToken?: Buffer | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    githubOrgName: string;
    isActive?: boolean | null | undefined;
    encryptedGithubOrgAccessToken?: Buffer | null | undefined;
}>;
export type TGithubOrgSyncConfigs = z.infer<typeof GithubOrgSyncConfigsSchema>;
export type TGithubOrgSyncConfigsInsert = Omit<z.input<typeof GithubOrgSyncConfigsSchema>, TImmutableDBKeys>;
export type TGithubOrgSyncConfigsUpdate = Partial<Omit<z.input<typeof GithubOrgSyncConfigsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=github-org-sync-configs.d.ts.map