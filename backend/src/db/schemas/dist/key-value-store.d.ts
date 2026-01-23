import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const KeyValueStoreSchema: z.ZodObject<{
    key: z.ZodString;
    integerValue: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    createdAt: Date;
    updatedAt: Date;
    key: string;
    expiresAt?: Date | null | undefined;
    integerValue?: number | null | undefined;
}, {
    createdAt: Date;
    updatedAt: Date;
    key: string;
    expiresAt?: Date | null | undefined;
    integerValue?: number | null | undefined;
}>;
export type TKeyValueStore = z.infer<typeof KeyValueStoreSchema>;
export type TKeyValueStoreInsert = Omit<z.input<typeof KeyValueStoreSchema>, TImmutableDBKeys>;
export type TKeyValueStoreUpdate = Partial<Omit<z.input<typeof KeyValueStoreSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=key-value-store.d.ts.map