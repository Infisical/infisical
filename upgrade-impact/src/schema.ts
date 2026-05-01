import { z } from "zod";

export const StableVersionSchema = z.string().regex(/^v\d+\.\d+\.\d+$/, "Expected a stable vX.Y.Z version");

export const ImpactLevelSchema = z.enum(["none", "low", "medium", "high"]);
export const ConfidenceSchema = z.enum(["low", "medium", "high"]);

export const EvidenceSchema = z
  .object({
    type: z.enum(["commit", "file", "pr", "release", "url"]),
    ref: z.string().min(1),
    url: z.string().url().optional(),
    path: z.string().min(1).optional(),
    description: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (value.type === "file" && !value.path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "File evidence requires a path",
        path: ["path"]
      });
    }

    if (["pr", "release", "url"].includes(value.type) && !value.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.type} evidence requires a url`,
        path: ["url"]
      });
    }
  });

export const ImpactEntrySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  action: z.string().min(1),
  confidence: ConfidenceSchema,
  evidence: z.array(EvidenceSchema).min(1)
});

export const ReleaseImpactSchema = z.object({
  version: StableVersionSchema,
  releasedAt: z.string().datetime({ offset: true }),
  sourceTag: StableVersionSchema,
  previousTag: StableVersionSchema.nullable(),
  impactLevel: ImpactLevelSchema,
  summary: z.string().min(1),
  requiresDbMigration: z.boolean(),
  breakingChanges: z.array(ImpactEntrySchema),
  dbSchemaChanges: z.array(ImpactEntrySchema),
  configChanges: z.array(ImpactEntrySchema),
  deploymentNotes: z.array(ImpactEntrySchema),
  knownIssues: z.array(ImpactEntrySchema),
  generatedBy: z.object({
    generator: z.string().min(1),
    generatorVersion: z.string().min(1),
    model: z.string().min(1),
    generatedAt: z.string().datetime({ offset: true }),
    sourceRange: z.object({
      from: StableVersionSchema.nullable(),
      to: StableVersionSchema
    })
  })
});

export const ReleaseIndexEntrySchema = z.object({
  version: StableVersionSchema,
  releasedAt: z.string().datetime({ offset: true }),
  file: z.string().regex(/^releases\/v\d+\.\d+\.\d+\.yaml$/)
});

export const ReleaseIndexSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  versions: z.array(ReleaseIndexEntrySchema)
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type ImpactEntry = z.infer<typeof ImpactEntrySchema>;
export type ReleaseImpact = z.infer<typeof ReleaseImpactSchema>;
export type ReleaseIndex = z.infer<typeof ReleaseIndexSchema>;
