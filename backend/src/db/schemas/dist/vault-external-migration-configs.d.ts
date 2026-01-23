import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const VaultExternalMigrationConfigsSchema: z.ZodObject<{
    id: z.ZodString;
    orgId: z.ZodString;
    namespace: z.ZodString;
    connectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    namespace: string;
    orgId: string;
    connectionId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    namespace: string;
    orgId: string;
    connectionId?: string | null | undefined;
}>;
export type TVaultExternalMigrationConfigs = z.infer<typeof VaultExternalMigrationConfigsSchema>;
export type TVaultExternalMigrationConfigsInsert = Omit<z.input<typeof VaultExternalMigrationConfigsSchema>, TImmutableDBKeys>;
export type TVaultExternalMigrationConfigsUpdate = Partial<Omit<z.input<typeof VaultExternalMigrationConfigsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=vault-external-migration-configs.d.ts.map