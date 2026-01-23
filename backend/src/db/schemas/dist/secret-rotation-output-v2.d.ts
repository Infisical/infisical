import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretRotationOutputV2Schema: z.ZodObject<{
    id: z.ZodString;
    key: z.ZodString;
    secretId: z.ZodString;
    rotationId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    key: string;
    secretId: string;
    rotationId: string;
}, {
    id: string;
    key: string;
    secretId: string;
    rotationId: string;
}>;
export type TSecretRotationOutputV2 = z.infer<typeof SecretRotationOutputV2Schema>;
export type TSecretRotationOutputV2Insert = Omit<z.input<typeof SecretRotationOutputV2Schema>, TImmutableDBKeys>;
export type TSecretRotationOutputV2Update = Partial<Omit<z.input<typeof SecretRotationOutputV2Schema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-rotation-output-v2.d.ts.map