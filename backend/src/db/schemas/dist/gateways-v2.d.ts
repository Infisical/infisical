/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const GatewaysV2Schema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    orgId: z.ZodString;
    identityId: z.ZodString;
    relayId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodString;
    heartbeat: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    encryptedPamSessionKey: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    healthAlertedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    identityId: string;
    relayId?: string | null | undefined;
    heartbeat?: Date | null | undefined;
    encryptedPamSessionKey?: Buffer | null | undefined;
    healthAlertedAt?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    identityId: string;
    relayId?: string | null | undefined;
    heartbeat?: Date | null | undefined;
    encryptedPamSessionKey?: Buffer | null | undefined;
    healthAlertedAt?: Date | null | undefined;
}>;
export type TGatewaysV2 = z.infer<typeof GatewaysV2Schema>;
export type TGatewaysV2Insert = Omit<z.input<typeof GatewaysV2Schema>, TImmutableDBKeys>;
export type TGatewaysV2Update = Partial<Omit<z.input<typeof GatewaysV2Schema>, TImmutableDBKeys>>;
//# sourceMappingURL=gateways-v2.d.ts.map