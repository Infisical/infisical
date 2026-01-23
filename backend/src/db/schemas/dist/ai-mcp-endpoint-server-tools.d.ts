import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AiMcpEndpointServerToolsSchema: z.ZodObject<{
    id: z.ZodString;
    aiMcpEndpointId: z.ZodString;
    aiMcpServerToolId: z.ZodString;
    isEnabled: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    aiMcpEndpointId: string;
    aiMcpServerToolId: string;
    isEnabled: boolean;
}, {
    id: string;
    aiMcpEndpointId: string;
    aiMcpServerToolId: string;
    isEnabled?: boolean | undefined;
}>;
export type TAiMcpEndpointServerTools = z.infer<typeof AiMcpEndpointServerToolsSchema>;
export type TAiMcpEndpointServerToolsInsert = Omit<z.input<typeof AiMcpEndpointServerToolsSchema>, TImmutableDBKeys>;
export type TAiMcpEndpointServerToolsUpdate = Partial<Omit<z.input<typeof AiMcpEndpointServerToolsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ai-mcp-endpoint-server-tools.d.ts.map