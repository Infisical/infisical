import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PamFoldersSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    parentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    description?: string | null | undefined;
    parentId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    description?: string | null | undefined;
    parentId?: string | null | undefined;
}>;
export type TPamFolders = z.infer<typeof PamFoldersSchema>;
export type TPamFoldersInsert = Omit<z.input<typeof PamFoldersSchema>, TImmutableDBKeys>;
export type TPamFoldersUpdate = Partial<Omit<z.input<typeof PamFoldersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pam-folders.d.ts.map