import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretRotationV2SecretMappingsSchema: z.ZodObject<{
    id: z.ZodString;
    secretId: z.ZodString;
    rotationId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    secretId: string;
    rotationId: string;
}, {
    id: string;
    secretId: string;
    rotationId: string;
}>;
export type TSecretRotationV2SecretMappings = z.infer<typeof SecretRotationV2SecretMappingsSchema>;
export type TSecretRotationV2SecretMappingsInsert = Omit<z.input<typeof SecretRotationV2SecretMappingsSchema>, TImmutableDBKeys>;
export type TSecretRotationV2SecretMappingsUpdate = Partial<Omit<z.input<typeof SecretRotationV2SecretMappingsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-rotation-v2-secret-mappings.d.ts.map