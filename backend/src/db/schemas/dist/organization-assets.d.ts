/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const OrganizationAssetsSchema: z.ZodObject<{
    id: z.ZodString;
    orgId: z.ZodString;
    assetType: z.ZodString;
    data: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    contentType: z.ZodString;
    size: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    assetType: string;
    data: Buffer;
    contentType: string;
    size: number;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    assetType: string;
    data: Buffer;
    contentType: string;
    size: number;
}>;
export type TOrganizationAssets = z.infer<typeof OrganizationAssetsSchema>;
export type TOrganizationAssetsInsert = Omit<z.input<typeof OrganizationAssetsSchema>, TImmutableDBKeys>;
export type TOrganizationAssetsUpdate = Partial<Omit<z.input<typeof OrganizationAssetsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=organization-assets.d.ts.map