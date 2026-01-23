import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectSplitBackfillIdsSchema: z.ZodObject<{
    id: z.ZodString;
    sourceProjectId: z.ZodString;
    destinationProjectType: z.ZodString;
    destinationProjectId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    sourceProjectId: string;
    destinationProjectType: string;
    destinationProjectId: string;
}, {
    id: string;
    sourceProjectId: string;
    destinationProjectType: string;
    destinationProjectId: string;
}>;
export type TProjectSplitBackfillIds = z.infer<typeof ProjectSplitBackfillIdsSchema>;
export type TProjectSplitBackfillIdsInsert = Omit<z.input<typeof ProjectSplitBackfillIdsSchema>, TImmutableDBKeys>;
export type TProjectSplitBackfillIdsUpdate = Partial<Omit<z.input<typeof ProjectSplitBackfillIdsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-split-backfill-ids.d.ts.map