/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const GatewaysSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    serialNumber: z.ZodString;
    keyAlgorithm: z.ZodString;
    issuedAt: z.ZodDate;
    expiration: z.ZodDate;
    heartbeat: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    relayAddress: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    orgGatewayRootCaId: z.ZodString;
    identityId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    keyAlgorithm: string;
    serialNumber: string;
    identityId: string;
    issuedAt: Date;
    expiration: Date;
    relayAddress: Buffer;
    orgGatewayRootCaId: string;
    heartbeat?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    keyAlgorithm: string;
    serialNumber: string;
    identityId: string;
    issuedAt: Date;
    expiration: Date;
    relayAddress: Buffer;
    orgGatewayRootCaId: string;
    heartbeat?: Date | null | undefined;
}>;
export type TGateways = z.infer<typeof GatewaysSchema>;
export type TGatewaysInsert = Omit<z.input<typeof GatewaysSchema>, TImmutableDBKeys>;
export type TGatewaysUpdate = Partial<Omit<z.input<typeof GatewaysSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=gateways.d.ts.map