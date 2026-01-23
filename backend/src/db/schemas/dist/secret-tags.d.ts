import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretTagsSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    createdBy: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    projectId: z.ZodString;
    createdByActorType: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    slug: string;
    createdByActorType: string;
    color?: string | null | undefined;
    createdBy?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    slug: string;
    color?: string | null | undefined;
    createdBy?: string | null | undefined;
    createdByActorType?: string | undefined;
}>;
export type TSecretTags = z.infer<typeof SecretTagsSchema>;
export type TSecretTagsInsert = Omit<z.input<typeof SecretTagsSchema>, TImmutableDBKeys>;
export type TSecretTagsUpdate = Partial<Omit<z.input<typeof SecretTagsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-tags.d.ts.map