import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const UserNotificationsSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    orgId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    type: z.ZodString;
    title: z.ZodString;
    body: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    link: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isRead: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    userId: string;
    title: string;
    isRead: boolean;
    orgId?: string | null | undefined;
    body?: string | null | undefined;
    link?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    userId: string;
    title: string;
    orgId?: string | null | undefined;
    body?: string | null | undefined;
    link?: string | null | undefined;
    isRead?: boolean | undefined;
}>;
export type TUserNotifications = z.infer<typeof UserNotificationsSchema>;
export type TUserNotificationsInsert = Omit<z.input<typeof UserNotificationsSchema>, TImmutableDBKeys>;
export type TUserNotificationsUpdate = Partial<Omit<z.input<typeof UserNotificationsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=user-notifications.d.ts.map