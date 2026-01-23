/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PamResourcesSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    name: z.ZodString;
    gatewayId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    resourceType: z.ZodString;
    encryptedConnectionDetails: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    encryptedRotationAccountCredentials: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    encryptedResourceMetadata: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    resourceType: string;
    encryptedConnectionDetails: Buffer;
    gatewayId?: string | null | undefined;
    encryptedRotationAccountCredentials?: Buffer | null | undefined;
    encryptedResourceMetadata?: Buffer | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    resourceType: string;
    encryptedConnectionDetails: Buffer;
    gatewayId?: string | null | undefined;
    encryptedRotationAccountCredentials?: Buffer | null | undefined;
    encryptedResourceMetadata?: Buffer | null | undefined;
}>;
export type TPamResources = z.infer<typeof PamResourcesSchema>;
export type TPamResourcesInsert = Omit<z.input<typeof PamResourcesSchema>, TImmutableDBKeys>;
export type TPamResourcesUpdate = Partial<Omit<z.input<typeof PamResourcesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pam-resources.d.ts.map