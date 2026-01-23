import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretScanningConfigsSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    content: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    content?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    content?: string | null | undefined;
}>;
export type TSecretScanningConfigs = z.infer<typeof SecretScanningConfigsSchema>;
export type TSecretScanningConfigsInsert = Omit<z.input<typeof SecretScanningConfigsSchema>, TImmutableDBKeys>;
export type TSecretScanningConfigsUpdate = Partial<Omit<z.input<typeof SecretScanningConfigsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-scanning-configs.d.ts.map