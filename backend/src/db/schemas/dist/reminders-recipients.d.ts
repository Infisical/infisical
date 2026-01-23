import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const RemindersRecipientsSchema: z.ZodObject<{
    id: z.ZodString;
    reminderId: z.ZodString;
    userId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    reminderId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    reminderId: string;
}>;
export type TRemindersRecipients = z.infer<typeof RemindersRecipientsSchema>;
export type TRemindersRecipientsInsert = Omit<z.input<typeof RemindersRecipientsSchema>, TImmutableDBKeys>;
export type TRemindersRecipientsUpdate = Partial<Omit<z.input<typeof RemindersRecipientsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=reminders-recipients.d.ts.map