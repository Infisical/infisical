import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretScanningResourcesSchema: z.ZodObject<{
    id: z.ZodString;
    externalId: z.ZodString;
    name: z.ZodString;
    type: z.ZodString;
    dataSourceId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    name: string;
    externalId: string;
    dataSourceId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    name: string;
    externalId: string;
    dataSourceId: string;
}>;
export type TSecretScanningResources = z.infer<typeof SecretScanningResourcesSchema>;
export type TSecretScanningResourcesInsert = Omit<z.input<typeof SecretScanningResourcesSchema>, TImmutableDBKeys>;
export type TSecretScanningResourcesUpdate = Partial<Omit<z.input<typeof SecretScanningResourcesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-scanning-resources.d.ts.map