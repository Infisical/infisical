import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const UserActionsSchema: z.ZodObject<{
    id: z.ZodString;
    action: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    userId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    action: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    action: string;
}>;
export type TUserActions = z.infer<typeof UserActionsSchema>;
export type TUserActionsInsert = Omit<z.input<typeof UserActionsSchema>, TImmutableDBKeys>;
export type TUserActionsUpdate = Partial<Omit<z.input<typeof UserActionsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=user-actions.d.ts.map