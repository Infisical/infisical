import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretRotationOutputsSchema: z.ZodObject<{
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
export type TSecretRotationOutputs = z.infer<typeof SecretRotationOutputsSchema>;
export type TSecretRotationOutputsInsert = Omit<z.input<typeof SecretRotationOutputsSchema>, TImmutableDBKeys>;
export type TSecretRotationOutputsUpdate = Partial<Omit<z.input<typeof SecretRotationOutputsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-rotation-outputs.d.ts.map