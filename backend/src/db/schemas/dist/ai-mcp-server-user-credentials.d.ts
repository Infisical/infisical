/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AiMcpServerUserCredentialsSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    aiMcpServerId: z.ZodString;
    encryptedCredentials: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    aiMcpServerId: string;
    userId: string;
    encryptedCredentials: Buffer;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    aiMcpServerId: string;
    userId: string;
    encryptedCredentials: Buffer;
}>;
export type TAiMcpServerUserCredentials = z.infer<typeof AiMcpServerUserCredentialsSchema>;
export type TAiMcpServerUserCredentialsInsert = Omit<z.input<typeof AiMcpServerUserCredentialsSchema>, TImmutableDBKeys>;
export type TAiMcpServerUserCredentialsUpdate = Partial<Omit<z.input<typeof AiMcpServerUserCredentialsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ai-mcp-server-user-credentials.d.ts.map