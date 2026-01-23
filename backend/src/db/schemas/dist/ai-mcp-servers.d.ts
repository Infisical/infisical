/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AiMcpServersSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    url: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    credentialMode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    authMethod: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedCredentials: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    encryptedOauthConfig: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    projectId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    url: string;
    status?: string | null | undefined;
    description?: string | null | undefined;
    encryptedCredentials?: Buffer | null | undefined;
    credentialMode?: string | null | undefined;
    authMethod?: string | null | undefined;
    encryptedOauthConfig?: Buffer | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    url: string;
    status?: string | null | undefined;
    description?: string | null | undefined;
    encryptedCredentials?: Buffer | null | undefined;
    credentialMode?: string | null | undefined;
    authMethod?: string | null | undefined;
    encryptedOauthConfig?: Buffer | null | undefined;
}>;
export type TAiMcpServers = z.infer<typeof AiMcpServersSchema>;
export type TAiMcpServersInsert = Omit<z.input<typeof AiMcpServersSchema>, TImmutableDBKeys>;
export type TAiMcpServersUpdate = Partial<Omit<z.input<typeof AiMcpServersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ai-mcp-servers.d.ts.map