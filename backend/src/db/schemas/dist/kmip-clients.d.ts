import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const KmipClientsSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    permissions: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    projectId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    projectId: string;
    permissions?: string[] | null | undefined;
    description?: string | null | undefined;
}, {
    id: string;
    name: string;
    projectId: string;
    permissions?: string[] | null | undefined;
    description?: string | null | undefined;
}>;
export type TKmipClients = z.infer<typeof KmipClientsSchema>;
export type TKmipClientsInsert = Omit<z.input<typeof KmipClientsSchema>, TImmutableDBKeys>;
export type TKmipClientsUpdate = Partial<Omit<z.input<typeof KmipClientsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=kmip-clients.d.ts.map