import type { DemoSecret } from "./fixtures";

export type Snapshot = { name: string; value?: string; comment?: string; description?: string };

export type DemoCommitChange = {
  type: "secret" | "folder";
  before?: Snapshot;
  after?: Snapshot;
};

export type DemoCommit = {
  id: string;
  projectId: string;
  environment: string;
  path: string;
  message: string;
  actor: string;
  createdAt: string;
  changes: DemoCommitChange[];
};

export const seedDemoCommits = (secrets: DemoSecret[]): DemoCommit[] => {
  const at = (key: string) =>
    secrets.find(
      (secret) =>
        secret.projectId === "payments-api" &&
        secret.env === "dev" &&
        secret.path === "/" &&
        secret.key === key
    );
  const snapshot = (key: string): Snapshot => ({
    name: key,
    value: at(key)?.value,
    comment: at(key)?.comment
  });
  const scope = { projectId: "payments-api", environment: "dev", path: "/" };
  return [
    {
      ...scope,
      id: "3f9c2a1e-6b7d-4c8e-9a0f-1d2e3f4a5b6c",
      message: "Add base service configuration",
      actor: "Sarah Lin",
      createdAt: "2026-10-20T16:05:00.000Z",
      changes: ["FEATURE_FLAGS", "REDIS_URL"].map((key) => ({
        type: "secret" as const,
        after: snapshot(key)
      }))
    },
    {
      ...scope,
      id: "8a7b6c5d-4e3f-4a1b-8c9d-0e1f2a3b4c5d",
      message: "Lower log level for incident review",
      actor: "Marcus Webb",
      createdAt: "2026-10-28T09:41:00.000Z",
      changes: [
        {
          type: "secret",
          before: { ...snapshot("LOG_LEVEL"), value: "debug" },
          after: snapshot("LOG_LEVEL")
        },
        { type: "folder", after: { name: "workers", description: "" } }
      ]
    }
  ];
};
