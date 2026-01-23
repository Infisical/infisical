import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiCollectionsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    projectId: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    description: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    description: string;
}>;
export type TPkiCollections = z.infer<typeof PkiCollectionsSchema>;
export type TPkiCollectionsInsert = Omit<z.input<typeof PkiCollectionsSchema>, TImmutableDBKeys>;
export type TPkiCollectionsUpdate = Partial<Omit<z.input<typeof PkiCollectionsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-collections.d.ts.map