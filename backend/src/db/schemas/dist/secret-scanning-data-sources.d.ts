/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretScanningDataSourcesSchema: z.ZodObject<{
    id: z.ZodString;
    externalId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    type: z.ZodString;
    config: z.ZodUnknown;
    encryptedCredentials: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    connectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isAutoScanEnabled: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    projectId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    isDisconnected: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    name: string;
    projectId: string;
    isDisconnected: boolean;
    description?: string | null | undefined;
    encryptedCredentials?: Buffer | null | undefined;
    config?: unknown;
    connectionId?: string | null | undefined;
    externalId?: string | null | undefined;
    isAutoScanEnabled?: boolean | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    name: string;
    projectId: string;
    description?: string | null | undefined;
    encryptedCredentials?: Buffer | null | undefined;
    config?: unknown;
    connectionId?: string | null | undefined;
    externalId?: string | null | undefined;
    isAutoScanEnabled?: boolean | null | undefined;
    isDisconnected?: boolean | undefined;
}>;
export type TSecretScanningDataSources = z.infer<typeof SecretScanningDataSourcesSchema>;
export type TSecretScanningDataSourcesInsert = Omit<z.input<typeof SecretScanningDataSourcesSchema>, TImmutableDBKeys>;
export type TSecretScanningDataSourcesUpdate = Partial<Omit<z.input<typeof SecretScanningDataSourcesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-scanning-data-sources.d.ts.map