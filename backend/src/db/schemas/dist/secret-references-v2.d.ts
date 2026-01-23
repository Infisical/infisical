import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretReferencesV2Schema: z.ZodObject<{
    id: z.ZodString;
    environment: z.ZodString;
    secretPath: z.ZodString;
    secretKey: z.ZodString;
    secretId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
}, {
    id: string;
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
}>;
export type TSecretReferencesV2 = z.infer<typeof SecretReferencesV2Schema>;
export type TSecretReferencesV2Insert = Omit<z.input<typeof SecretReferencesV2Schema>, TImmutableDBKeys>;
export type TSecretReferencesV2Update = Partial<Omit<z.input<typeof SecretReferencesV2Schema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-references-v2.d.ts.map