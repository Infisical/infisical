import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IncidentContactsSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    orgId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    email: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    email: string;
}>;
export type TIncidentContacts = z.infer<typeof IncidentContactsSchema>;
export type TIncidentContactsInsert = Omit<z.input<typeof IncidentContactsSchema>, TImmutableDBKeys>;
export type TIncidentContactsUpdate = Partial<Omit<z.input<typeof IncidentContactsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=incident-contacts.d.ts.map