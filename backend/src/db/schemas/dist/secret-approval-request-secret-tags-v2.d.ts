import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretApprovalRequestSecretTagsV2Schema: z.ZodObject<{
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
export type TSecretApprovalRequestSecretTagsV2 = z.infer<typeof SecretApprovalRequestSecretTagsV2Schema>;
export type TSecretApprovalRequestSecretTagsV2Insert = Omit<z.input<typeof SecretApprovalRequestSecretTagsV2Schema>, TImmutableDBKeys>;
export type TSecretApprovalRequestSecretTagsV2Update = Partial<Omit<z.input<typeof SecretApprovalRequestSecretTagsV2Schema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-approval-request-secret-tags-v2.d.ts.map