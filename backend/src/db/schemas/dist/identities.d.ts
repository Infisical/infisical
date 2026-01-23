import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentitiesSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    authMethod: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    hasDeleteProtection: z.ZodDefault<z.ZodBoolean>;
    orgId: z.ZodString;
    projectId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    hasDeleteProtection: boolean;
    projectId?: string | null | undefined;
    authMethod?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    projectId?: string | null | undefined;
    authMethod?: string | null | undefined;
    hasDeleteProtection?: boolean | undefined;
}>;
export type TIdentities = z.infer<typeof IdentitiesSchema>;
export type TIdentitiesInsert = Omit<z.input<typeof IdentitiesSchema>, TImmutableDBKeys>;
export type TIdentitiesUpdate = Partial<Omit<z.input<typeof IdentitiesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identities.d.ts.map