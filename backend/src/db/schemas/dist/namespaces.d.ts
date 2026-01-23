import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const NamespacesSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    orgId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    description?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    description?: string | null | undefined;
}>;
export type TNamespaces = z.infer<typeof NamespacesSchema>;
export type TNamespacesInsert = Omit<z.input<typeof NamespacesSchema>, TImmutableDBKeys>;
export type TNamespacesUpdate = Partial<Omit<z.input<typeof NamespacesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=namespaces.d.ts.map