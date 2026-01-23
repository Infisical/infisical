import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AiMcpServerToolsSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    inputSchema: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    aiMcpServerId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    aiMcpServerId: string;
    description?: string | null | undefined;
    inputSchema?: unknown;
}, {
    id: string;
    name: string;
    aiMcpServerId: string;
    description?: string | null | undefined;
    inputSchema?: unknown;
}>;
export type TAiMcpServerTools = z.infer<typeof AiMcpServerToolsSchema>;
export type TAiMcpServerToolsInsert = Omit<z.input<typeof AiMcpServerToolsSchema>, TImmutableDBKeys>;
export type TAiMcpServerToolsUpdate = Partial<Omit<z.input<typeof AiMcpServerToolsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ai-mcp-server-tools.d.ts.map