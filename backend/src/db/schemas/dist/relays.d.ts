import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const RelaysSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    orgId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    identityId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodString;
    host: z.ZodString;
    heartbeat: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    healthAlertedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    host: string;
    orgId?: string | null | undefined;
    identityId?: string | null | undefined;
    heartbeat?: Date | null | undefined;
    healthAlertedAt?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    host: string;
    orgId?: string | null | undefined;
    identityId?: string | null | undefined;
    heartbeat?: Date | null | undefined;
    healthAlertedAt?: Date | null | undefined;
}>;
export type TRelays = z.infer<typeof RelaysSchema>;
export type TRelaysInsert = Omit<z.input<typeof RelaysSchema>, TImmutableDBKeys>;
export type TRelaysUpdate = Partial<Omit<z.input<typeof RelaysSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=relays.d.ts.map