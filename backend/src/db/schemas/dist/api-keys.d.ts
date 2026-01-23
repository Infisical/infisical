import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ApiKeysSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    lastUsed: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    secretHash: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    userId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    userId: string;
    secretHash: string;
    lastUsed?: Date | null | undefined;
    expiresAt?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    userId: string;
    secretHash: string;
    lastUsed?: Date | null | undefined;
    expiresAt?: Date | null | undefined;
}>;
export type TApiKeys = z.infer<typeof ApiKeysSchema>;
export type TApiKeysInsert = Omit<z.input<typeof ApiKeysSchema>, TImmutableDBKeys>;
export type TApiKeysUpdate = Partial<Omit<z.input<typeof ApiKeysSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=api-keys.d.ts.map