/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const OrgRelayConfigSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    orgId: z.ZodString;
    encryptedRelayPkiClientCaPrivateKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedRelayPkiClientCaCertificate: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedRelayPkiClientCaCertificateChain: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedRelayPkiServerCaPrivateKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedRelayPkiServerCaCertificate: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedRelayPkiServerCaCertificateChain: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedRelaySshClientCaPrivateKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedRelaySshClientCaPublicKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedRelaySshServerCaPrivateKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedRelaySshServerCaPublicKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    encryptedRelayPkiClientCaPrivateKey: Buffer;
    encryptedRelayPkiClientCaCertificate: Buffer;
    encryptedRelayPkiClientCaCertificateChain: Buffer;
    encryptedRelayPkiServerCaPrivateKey: Buffer;
    encryptedRelayPkiServerCaCertificate: Buffer;
    encryptedRelayPkiServerCaCertificateChain: Buffer;
    encryptedRelaySshClientCaPrivateKey: Buffer;
    encryptedRelaySshClientCaPublicKey: Buffer;
    encryptedRelaySshServerCaPrivateKey: Buffer;
    encryptedRelaySshServerCaPublicKey: Buffer;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    encryptedRelayPkiClientCaPrivateKey: Buffer;
    encryptedRelayPkiClientCaCertificate: Buffer;
    encryptedRelayPkiClientCaCertificateChain: Buffer;
    encryptedRelayPkiServerCaPrivateKey: Buffer;
    encryptedRelayPkiServerCaCertificate: Buffer;
    encryptedRelayPkiServerCaCertificateChain: Buffer;
    encryptedRelaySshClientCaPrivateKey: Buffer;
    encryptedRelaySshClientCaPublicKey: Buffer;
    encryptedRelaySshServerCaPrivateKey: Buffer;
    encryptedRelaySshServerCaPublicKey: Buffer;
}>;
export type TOrgRelayConfig = z.infer<typeof OrgRelayConfigSchema>;
export type TOrgRelayConfigInsert = Omit<z.input<typeof OrgRelayConfigSchema>, TImmutableDBKeys>;
export type TOrgRelayConfigUpdate = Partial<Omit<z.input<typeof OrgRelayConfigSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=org-relay-config.d.ts.map