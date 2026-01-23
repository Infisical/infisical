/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const OrgGatewayConfigV2Schema: z.ZodObject<{
    id: z.ZodString;
    orgId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    encryptedRootGatewayCaPrivateKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedRootGatewayCaCertificate: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedGatewayServerCaPrivateKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedGatewayServerCaCertificate: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedGatewayServerCaCertificateChain: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedGatewayClientCaPrivateKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedGatewayClientCaCertificate: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedGatewayClientCaCertificateChain: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    encryptedRootGatewayCaPrivateKey: Buffer;
    encryptedRootGatewayCaCertificate: Buffer;
    encryptedGatewayServerCaPrivateKey: Buffer;
    encryptedGatewayServerCaCertificate: Buffer;
    encryptedGatewayServerCaCertificateChain: Buffer;
    encryptedGatewayClientCaPrivateKey: Buffer;
    encryptedGatewayClientCaCertificate: Buffer;
    encryptedGatewayClientCaCertificateChain: Buffer;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    encryptedRootGatewayCaPrivateKey: Buffer;
    encryptedRootGatewayCaCertificate: Buffer;
    encryptedGatewayServerCaPrivateKey: Buffer;
    encryptedGatewayServerCaCertificate: Buffer;
    encryptedGatewayServerCaCertificateChain: Buffer;
    encryptedGatewayClientCaPrivateKey: Buffer;
    encryptedGatewayClientCaCertificate: Buffer;
    encryptedGatewayClientCaCertificateChain: Buffer;
}>;
export type TOrgGatewayConfigV2 = z.infer<typeof OrgGatewayConfigV2Schema>;
export type TOrgGatewayConfigV2Insert = Omit<z.input<typeof OrgGatewayConfigV2Schema>, TImmutableDBKeys>;
export type TOrgGatewayConfigV2Update = Partial<Omit<z.input<typeof OrgGatewayConfigV2Schema>, TImmutableDBKeys>>;
//# sourceMappingURL=org-gateway-config-v2.d.ts.map