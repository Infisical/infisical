import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ScimEventsSchema: z.ZodObject<{
    id: z.ZodString;
    orgId: z.ZodString;
    eventType: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    eventType?: string | null | undefined;
    event?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    eventType?: string | null | undefined;
    event?: unknown;
}>;
export type TScimEvents = z.infer<typeof ScimEventsSchema>;
export type TScimEventsInsert = Omit<z.input<typeof ScimEventsSchema>, TImmutableDBKeys>;
export type TScimEventsUpdate = Partial<Omit<z.input<typeof ScimEventsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=scim-events.d.ts.map