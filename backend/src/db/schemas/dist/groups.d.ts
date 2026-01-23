import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const GroupsSchema: z.ZodObject<{
    id: z.ZodString;
    orgId: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    slug: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    slug: string;
}>;
export type TGroups = z.infer<typeof GroupsSchema>;
export type TGroupsInsert = Omit<z.input<typeof GroupsSchema>, TImmutableDBKeys>;
export type TGroupsUpdate = Partial<Omit<z.input<typeof GroupsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=groups.d.ts.map