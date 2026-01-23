/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ResourceMetadataSchema: z.ZodObject<{
    id: z.ZodString;
    key: z.ZodString;
    value: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    orgId: z.ZodString;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    identityId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    secretId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    dynamicSecretId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedValue: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    key: string;
    value?: string | null | undefined;
    userId?: string | null | undefined;
    dynamicSecretId?: string | null | undefined;
    identityId?: string | null | undefined;
    secretId?: string | null | undefined;
    encryptedValue?: Buffer | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    key: string;
    value?: string | null | undefined;
    userId?: string | null | undefined;
    dynamicSecretId?: string | null | undefined;
    identityId?: string | null | undefined;
    secretId?: string | null | undefined;
    encryptedValue?: Buffer | null | undefined;
}>;
export type TResourceMetadata = z.infer<typeof ResourceMetadataSchema>;
export type TResourceMetadataInsert = Omit<z.input<typeof ResourceMetadataSchema>, TImmutableDBKeys>;
export type TResourceMetadataUpdate = Partial<Omit<z.input<typeof ResourceMetadataSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=resource-metadata.d.ts.map