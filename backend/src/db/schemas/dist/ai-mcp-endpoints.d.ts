import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AiMcpEndpointsSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    projectId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    piiRequestFiltering: z.ZodDefault<z.ZodBoolean>;
    piiResponseFiltering: z.ZodDefault<z.ZodBoolean>;
    piiEntityTypes: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    piiRequestFiltering: boolean;
    piiResponseFiltering: boolean;
    status?: string | null | undefined;
    description?: string | null | undefined;
    piiEntityTypes?: string[] | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    status?: string | null | undefined;
    description?: string | null | undefined;
    piiRequestFiltering?: boolean | undefined;
    piiResponseFiltering?: boolean | undefined;
    piiEntityTypes?: string[] | null | undefined;
}>;
export type TAiMcpEndpoints = z.infer<typeof AiMcpEndpointsSchema>;
export type TAiMcpEndpointsInsert = Omit<z.input<typeof AiMcpEndpointsSchema>, TImmutableDBKeys>;
export type TAiMcpEndpointsUpdate = Partial<Omit<z.input<typeof AiMcpEndpointsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ai-mcp-endpoints.d.ts.map