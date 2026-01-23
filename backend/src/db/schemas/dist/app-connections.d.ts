/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AppConnectionsSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    app: z.ZodString;
    method: z.ZodString;
    encryptedCredentials: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    version: z.ZodDefault<z.ZodNumber>;
    orgId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    isPlatformManagedCredentials: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    gatewayId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    projectId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    encryptedCredentials: Buffer;
    app: string;
    method: string;
    version: number;
    projectId?: string | null | undefined;
    description?: string | null | undefined;
    isPlatformManagedCredentials?: boolean | null | undefined;
    gatewayId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    encryptedCredentials: Buffer;
    app: string;
    method: string;
    projectId?: string | null | undefined;
    description?: string | null | undefined;
    version?: number | undefined;
    isPlatformManagedCredentials?: boolean | null | undefined;
    gatewayId?: string | null | undefined;
}>;
export type TAppConnections = z.infer<typeof AppConnectionsSchema>;
export type TAppConnectionsInsert = Omit<z.input<typeof AppConnectionsSchema>, TImmutableDBKeys>;
export type TAppConnectionsUpdate = Partial<Omit<z.input<typeof AppConnectionsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=app-connections.d.ts.map