import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { ReleaseImpact, ReleaseIndex } from "./schema.js";
import { validateUpgradeImpactData } from "./validate.js";

const makeRelease = (overrides: Partial<ReleaseImpact> = {}): ReleaseImpact => {
  const version = overrides.version ?? "v1.2.3";
  const previousTag = overrides.previousTag ?? "v1.2.2";

  return {
    version,
    releasedAt: "2026-04-29T00:00:00.000Z",
    sourceTag: version,
    previousTag,
    impactLevel: "medium",
    summary: "Self-hosted upgrade impact was detected.",
    requiresDbMigration: true,
    breakingChanges: [],
    dbSchemaChanges: [
      {
        title: "Database schema migrations are included",
        description: "This release includes a database migration.",
        action: "Back up the database before upgrading.",
        confidence: "high",
        evidence: [
          {
            type: "file",
            ref: "backend/src/db/migrations/20260429000000_example.ts",
            path: "backend/src/db/migrations/20260429000000_example.ts"
          }
        ]
      }
    ],
    configChanges: [],
    deploymentNotes: [],
    knownIssues: [],
    generatedBy: {
      generator: "@infisical/upgrade-impact",
      generatorVersion: "1",
      model: "test",
      generatedAt: "2026-04-29T00:00:00.000Z",
      sourceRange: {
        from: previousTag,
        to: version
      }
    },
    ...overrides
  };
};

const makeIndex = (versions: ReleaseIndex["versions"]): ReleaseIndex => ({
  schemaVersion: 1,
  generatedAt: "2026-04-29T00:00:00.000Z",
  versions
});

const writeFixture = async ({
  index,
  releases,
  invalidJsonFiles = []
}: {
  index: ReleaseIndex;
  releases: { fileName: string; release: ReleaseImpact }[];
  invalidJsonFiles?: { relativePath: string; content: string }[];
}) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "upgrade-impact-"));
  const releasesDir = path.join(dataDir, "releases");

  await fs.mkdir(releasesDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "index.yaml"), stringify(index));

  for (const { fileName, release } of releases) {
    await fs.writeFile(path.join(releasesDir, fileName), stringify(release));
  }

  for (const { relativePath, content } of invalidJsonFiles) {
    await fs.writeFile(path.join(dataDir, relativePath), content);
  }

  return dataDir;
};

type ValidationCase = {
  name: string;
  index: ReleaseIndex;
  releases: { fileName: string; release: ReleaseImpact }[];
  invalidJsonFiles?: { relativePath: string; content: string }[];
  expectedErrors: string[];
};

const validRelease = makeRelease();

const validationCases: ValidationCase[] = [
  {
    name: "accepts a valid indexed release file",
    index: makeIndex([
      {
        version: validRelease.version,
        releasedAt: validRelease.releasedAt,
        file: `releases/${validRelease.version}.yaml`
      }
    ]),
    releases: [{ fileName: `${validRelease.version}.yaml`, release: validRelease }],
    expectedErrors: []
  },
  {
    name: "rejects a release file missing from the index",
    index: makeIndex([]),
    releases: [{ fileName: `${validRelease.version}.yaml`, release: validRelease }],
    expectedErrors: [
      `${validRelease.version}.yaml is not listed in index.yaml`,
      `${validRelease.version}.yaml is not referenced by index.yaml`
    ]
  },
  {
    name: "rejects an impact entry without evidence",
    index: makeIndex([
      {
        version: validRelease.version,
        releasedAt: validRelease.releasedAt,
        file: `releases/${validRelease.version}.yaml`
      }
    ]),
    releases: [
      {
        fileName: `${validRelease.version}.yaml`,
        release: makeRelease({
          dbSchemaChanges: [
            {
              title: "Database schema migrations are included",
              description: "This release includes a database migration.",
              action: "Back up the database before upgrading.",
              confidence: "high",
              evidence: []
            }
          ]
        })
      }
    ],
    expectedErrors: [`${validRelease.version}.yaml failed schema validation`]
  },
  {
    name: "reports invalid release YAML without aborting validation",
    index: makeIndex([
      {
        version: validRelease.version,
        releasedAt: validRelease.releasedAt,
        file: `releases/${validRelease.version}.yaml`
      }
    ]),
    releases: [],
    invalidJsonFiles: [
      {
        relativePath: `releases/${validRelease.version}.yaml`,
        content: "a: ["
      }
    ],
    expectedErrors: [`${validRelease.version}.yaml contains invalid YAML`]
  },
  {
    name: "rejects duplicate evidence within an impact entry",
    index: makeIndex([
      {
        version: validRelease.version,
        releasedAt: validRelease.releasedAt,
        file: `releases/${validRelease.version}.yaml`
      }
    ]),
    releases: [
      {
        fileName: `${validRelease.version}.yaml`,
        release: makeRelease({
          dbSchemaChanges: [
            {
              title: "Database schema migrations are included",
              description: "This release includes a database migration.",
              action: "Back up the database before upgrading.",
              confidence: "high",
              evidence: [
                {
                  type: "file",
                  ref: "backend/src/db/migrations/20260429000000_example.ts",
                  path: "backend/src/db/migrations/20260429000000_example.ts"
                },
                {
                  type: "file",
                  ref: "backend/src/db/migrations/20260429000000_example.ts",
                  path: "backend/src/db/migrations/20260429000000_example.ts"
                }
              ]
            }
          ]
        })
      }
    ],
    expectedErrors: [`${validRelease.version}.yaml repeats evidence file:backend/src/db/migrations/20260429000000_example.ts`]
  },
  {
    name: "rejects duplicate impact entry titles",
    index: makeIndex([
      {
        version: validRelease.version,
        releasedAt: validRelease.releasedAt,
        file: `releases/${validRelease.version}.yaml`
      }
    ]),
    releases: [
      {
        fileName: `${validRelease.version}.yaml`,
        release: makeRelease({
          breakingChanges: [
            {
              title: "Database schema migrations are included",
              description: "The same impact is reported in another section.",
              action: "Keep only one entry for this impact.",
              confidence: "medium",
              evidence: [
                {
                  type: "file",
                  ref: "backend/src/db/migrations/20260429000000_example.ts",
                  path: "backend/src/db/migrations/20260429000000_example.ts"
                }
              ]
            }
          ]
        })
      }
    ],
    expectedErrors: [`${validRelease.version}.yaml repeats impact entry title "Database schema migrations are included"`]
  },
  {
    name: "rejects unclear operator actions",
    index: makeIndex([
      {
        version: validRelease.version,
        releasedAt: validRelease.releasedAt,
        file: `releases/${validRelease.version}.yaml`
      }
    ]),
    releases: [
      {
        fileName: `${validRelease.version}.yaml`,
        release: makeRelease({
          dbSchemaChanges: [
            {
              title: "Database schema migrations are included",
              description: "This release includes a database migration.",
              action: "Set TRUSTED_PROXY_CIDRS to your proxy CIDR ranges and restart.",
              confidence: "high",
              evidence: [
                {
                  type: "file",
                  ref: "backend/src/db/migrations/20260429000000_example.ts",
                  path: "backend/src/db/migrations/20260429000000_example.ts"
                }
              ]
            }
          ]
        })
      }
    ],
    expectedErrors: [`${validRelease.version}.yaml uses unclear operator action`]
  }
];

describe("validateUpgradeImpactData", () => {
  it.each(validationCases)("$name", async ({ index, releases, invalidJsonFiles, expectedErrors }) => {
    const dataDir = await writeFixture({ index, releases, invalidJsonFiles });
    const result = await validateUpgradeImpactData({ dataDir, skipGitChecks: true });

    for (const expectedError of expectedErrors) {
      expect(result.errors.some((error) => error.includes(expectedError))).toBe(true);
    }

    if (expectedErrors.length === 0) {
      expect(result.errors).toEqual([]);
    }
  });
});
