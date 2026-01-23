/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityAuthTemplatesSchema: z.ZodObject<{
    id: z.ZodString;
    templateFields: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    orgId: z.ZodString;
    name: z.ZodString;
    authMethod: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    authMethod: string;
    templateFields: Buffer;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    authMethod: string;
    templateFields: Buffer;
}>;
export type TIdentityAuthTemplates = z.infer<typeof IdentityAuthTemplatesSchema>;
export type TIdentityAuthTemplatesInsert = Omit<z.input<typeof IdentityAuthTemplatesSchema>, TImmutableDBKeys>;
export type TIdentityAuthTemplatesUpdate = Partial<Omit<z.input<typeof IdentityAuthTemplatesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-auth-templates.d.ts.map