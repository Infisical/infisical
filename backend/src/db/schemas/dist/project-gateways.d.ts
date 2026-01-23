import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectGatewaysSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    gatewayId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    gatewayId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    gatewayId: string;
}>;
export type TProjectGateways = z.infer<typeof ProjectGatewaysSchema>;
export type TProjectGatewaysInsert = Omit<z.input<typeof ProjectGatewaysSchema>, TImmutableDBKeys>;
export type TProjectGatewaysUpdate = Partial<Omit<z.input<typeof ProjectGatewaysSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-gateways.d.ts.map