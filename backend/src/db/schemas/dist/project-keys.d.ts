import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectKeysSchema: z.ZodObject<{
    id: z.ZodString;
    encryptedKey: z.ZodString;
    nonce: z.ZodString;
    receiverId: z.ZodString;
    senderId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    projectId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    encryptedKey: string;
    nonce: string;
    receiverId: string;
    senderId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    encryptedKey: string;
    nonce: string;
    receiverId: string;
    senderId?: string | null | undefined;
}>;
export type TProjectKeys = z.infer<typeof ProjectKeysSchema>;
export type TProjectKeysInsert = Omit<z.input<typeof ProjectKeysSchema>, TImmutableDBKeys>;
export type TProjectKeysUpdate = Partial<Omit<z.input<typeof ProjectKeysSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-keys.d.ts.map