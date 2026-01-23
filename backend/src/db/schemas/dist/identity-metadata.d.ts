import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityMetadataSchema: z.ZodObject<{
    id: z.ZodString;
    key: z.ZodString;
    value: z.ZodString;
    orgId: z.ZodString;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    identityId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    value: string;
    orgId: string;
    key: string;
    userId?: string | null | undefined;
    identityId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    value: string;
    orgId: string;
    key: string;
    userId?: string | null | undefined;
    identityId?: string | null | undefined;
}>;
export type TIdentityMetadata = z.infer<typeof IdentityMetadataSchema>;
export type TIdentityMetadataInsert = Omit<z.input<typeof IdentityMetadataSchema>, TImmutableDBKeys>;
export type TIdentityMetadataUpdate = Partial<Omit<z.input<typeof IdentityMetadataSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-metadata.d.ts.map