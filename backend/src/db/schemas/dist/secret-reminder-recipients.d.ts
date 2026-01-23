import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretReminderRecipientsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    secretId: z.ZodString;
    userId: z.ZodString;
    projectId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    userId: string;
    secretId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    userId: string;
    secretId: string;
}>;
export type TSecretReminderRecipients = z.infer<typeof SecretReminderRecipientsSchema>;
export type TSecretReminderRecipientsInsert = Omit<z.input<typeof SecretReminderRecipientsSchema>, TImmutableDBKeys>;
export type TSecretReminderRecipientsUpdate = Partial<Omit<z.input<typeof SecretReminderRecipientsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-reminder-recipients.d.ts.map