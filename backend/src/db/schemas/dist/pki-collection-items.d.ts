import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiCollectionItemsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    pkiCollectionId: z.ZodString;
    caId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    certId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    pkiCollectionId: string;
    caId?: string | null | undefined;
    certId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    pkiCollectionId: string;
    caId?: string | null | undefined;
    certId?: string | null | undefined;
}>;
export type TPkiCollectionItems = z.infer<typeof PkiCollectionItemsSchema>;
export type TPkiCollectionItemsInsert = Omit<z.input<typeof PkiCollectionItemsSchema>, TImmutableDBKeys>;
export type TPkiCollectionItemsUpdate = Partial<Omit<z.input<typeof PkiCollectionItemsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-collection-items.d.ts.map