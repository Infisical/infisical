import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AiMcpEndpointServersSchema: z.ZodObject<{
    id: z.ZodString;
    aiMcpEndpointId: z.ZodString;
    aiMcpServerId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    aiMcpEndpointId: string;
    aiMcpServerId: string;
}, {
    id: string;
    aiMcpEndpointId: string;
    aiMcpServerId: string;
}>;
export type TAiMcpEndpointServers = z.infer<typeof AiMcpEndpointServersSchema>;
export type TAiMcpEndpointServersInsert = Omit<z.input<typeof AiMcpEndpointServersSchema>, TImmutableDBKeys>;
export type TAiMcpEndpointServersUpdate = Partial<Omit<z.input<typeof AiMcpEndpointServersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ai-mcp-endpoint-servers.d.ts.map