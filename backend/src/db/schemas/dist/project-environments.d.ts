import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectEnvironmentsSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
    position: z.ZodNumber;
    projectId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    slug: string;
    position: number;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    slug: string;
    position: number;
}>;
export type TProjectEnvironments = z.infer<typeof ProjectEnvironmentsSchema>;
export type TProjectEnvironmentsInsert = Omit<z.input<typeof ProjectEnvironmentsSchema>, TImmutableDBKeys>;
export type TProjectEnvironmentsUpdate = Partial<Omit<z.input<typeof ProjectEnvironmentsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-environments.d.ts.map