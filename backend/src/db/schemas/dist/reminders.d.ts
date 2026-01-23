import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const RemindersSchema: z.ZodObject<{
    id: z.ZodString;
    secretId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    message: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    repeatDays: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    nextReminderDate: z.ZodDate;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    fromDate: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    nextReminderDate: Date;
    message?: string | null | undefined;
    secretId?: string | null | undefined;
    repeatDays?: number | null | undefined;
    fromDate?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    nextReminderDate: Date;
    message?: string | null | undefined;
    secretId?: string | null | undefined;
    repeatDays?: number | null | undefined;
    fromDate?: Date | null | undefined;
}>;
export type TReminders = z.infer<typeof RemindersSchema>;
export type TRemindersInsert = Omit<z.input<typeof RemindersSchema>, TImmutableDBKeys>;
export type TRemindersUpdate = Partial<Omit<z.input<typeof RemindersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=reminders.d.ts.map