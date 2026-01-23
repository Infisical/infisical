import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const KmsKeysSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isDisabled: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    isReserved: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    orgId: z.ZodString;
    name: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    projectId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    keyUsage: z.ZodDefault<z.ZodString>;
    kmipMetadata: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    keyUsage: string;
    projectId?: string | null | undefined;
    description?: string | null | undefined;
    isDisabled?: boolean | null | undefined;
    isReserved?: boolean | null | undefined;
    kmipMetadata?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    projectId?: string | null | undefined;
    description?: string | null | undefined;
    isDisabled?: boolean | null | undefined;
    isReserved?: boolean | null | undefined;
    keyUsage?: string | undefined;
    kmipMetadata?: unknown;
}>;
export type TKmsKeys = z.infer<typeof KmsKeysSchema>;
export type TKmsKeysInsert = Omit<z.input<typeof KmsKeysSchema>, TImmutableDBKeys>;
export type TKmsKeysUpdate = Partial<Omit<z.input<typeof KmsKeysSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=kms-keys.d.ts.map