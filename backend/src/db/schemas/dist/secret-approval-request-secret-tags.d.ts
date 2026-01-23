import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretApprovalRequestSecretTagsSchema: z.ZodObject<{
    id: z.ZodString;
    secretId: z.ZodString;
    tagId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    secretId: string;
    tagId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    secretId: string;
    tagId: string;
}>;
export type TSecretApprovalRequestSecretTags = z.infer<typeof SecretApprovalRequestSecretTagsSchema>;
export type TSecretApprovalRequestSecretTagsInsert = Omit<z.input<typeof SecretApprovalRequestSecretTagsSchema>, TImmutableDBKeys>;
export type TSecretApprovalRequestSecretTagsUpdate = Partial<Omit<z.input<typeof SecretApprovalRequestSecretTagsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-approval-request-secret-tags.d.ts.map