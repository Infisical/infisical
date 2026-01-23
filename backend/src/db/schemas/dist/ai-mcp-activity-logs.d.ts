import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AiMcpActivityLogsSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    endpointName: z.ZodString;
    serverName: z.ZodString;
    toolName: z.ZodString;
    actor: z.ZodString;
    request: z.ZodUnknown;
    response: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    endpointName: string;
    serverName: string;
    toolName: string;
    actor: string;
    request?: unknown;
    response?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    endpointName: string;
    serverName: string;
    toolName: string;
    actor: string;
    request?: unknown;
    response?: unknown;
}>;
export type TAiMcpActivityLogs = z.infer<typeof AiMcpActivityLogsSchema>;
export type TAiMcpActivityLogsInsert = Omit<z.input<typeof AiMcpActivityLogsSchema>, TImmutableDBKeys>;
export type TAiMcpActivityLogsUpdate = Partial<Omit<z.input<typeof AiMcpActivityLogsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ai-mcp-activity-logs.d.ts.map