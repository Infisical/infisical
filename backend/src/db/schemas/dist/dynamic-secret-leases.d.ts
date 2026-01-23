import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const DynamicSecretLeasesSchema: z.ZodObject<{
    id: z.ZodString;
    version: z.ZodNumber;
    externalEntityId: z.ZodString;
    expireAt: z.ZodDate;
    status: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    statusDetails: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    dynamicSecretId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    config: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
    externalEntityId: string;
    expireAt: Date;
    dynamicSecretId: string;
    status?: string | null | undefined;
    statusDetails?: string | null | undefined;
    config?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
    externalEntityId: string;
    expireAt: Date;
    dynamicSecretId: string;
    status?: string | null | undefined;
    statusDetails?: string | null | undefined;
    config?: unknown;
}>;
export type TDynamicSecretLeases = z.infer<typeof DynamicSecretLeasesSchema>;
export type TDynamicSecretLeasesInsert = Omit<z.input<typeof DynamicSecretLeasesSchema>, TImmutableDBKeys>;
export type TDynamicSecretLeasesUpdate = Partial<Omit<z.input<typeof DynamicSecretLeasesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=dynamic-secret-leases.d.ts.map