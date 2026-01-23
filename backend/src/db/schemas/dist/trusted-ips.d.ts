import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const TrustedIpsSchema: z.ZodObject<{
    id: z.ZodString;
    ipAddress: z.ZodString;
    type: z.ZodString;
    prefix: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    isActive: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    comment: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    projectId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    projectId: string;
    ipAddress: string;
    isActive?: boolean | null | undefined;
    comment?: string | null | undefined;
    prefix?: number | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    projectId: string;
    ipAddress: string;
    isActive?: boolean | null | undefined;
    comment?: string | null | undefined;
    prefix?: number | null | undefined;
}>;
export type TTrustedIps = z.infer<typeof TrustedIpsSchema>;
export type TTrustedIpsInsert = Omit<z.input<typeof TrustedIpsSchema>, TImmutableDBKeys>;
export type TTrustedIpsUpdate = Partial<Omit<z.input<typeof TrustedIpsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=trusted-ips.d.ts.map