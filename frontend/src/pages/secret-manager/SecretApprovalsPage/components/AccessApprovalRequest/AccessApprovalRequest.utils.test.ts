import { describe, expect, test } from "vitest";

import { buildFolderTree } from "./AccessApprovalRequest.utils";

const leaf = (path: string, label: string) => ({ path, label, children: [] });

describe("buildFolderTree", () => {
  test("nests each folder under its parent, labelled by its own name, and keeps the root on its own", () => {
    expect(buildFolderTree(["/database", "/aws/s3/credentials", "/", "/aws/s3", "/aws"])).toEqual([
      leaf("/", "/"),
      {
        path: "/aws",
        label: "/aws",
        children: [
          {
            path: "/aws/s3",
            label: "s3",
            children: [leaf("/aws/s3/credentials", "credentials")]
          }
        ]
      },
      leaf("/database", "/database")
    ]);
  });

  test("lists the root first, then groups, then single folders, each by name", () => {
    expect(
      buildFolderTree([
        "/app",
        "/vault/kv",
        "/",
        "/aws/s3",
        "/vault",
        "/aws",
        "/billing",
        "/aws/s3/keys"
      ])
    ).toEqual([
      leaf("/", "/"),
      {
        path: "/aws",
        label: "/aws",
        children: [{ path: "/aws/s3", label: "s3", children: [leaf("/aws/s3/keys", "keys")] }]
      },
      { path: "/vault", label: "/vault", children: [leaf("/vault/kv", "kv")] },
      leaf("/app", "/app"),
      leaf("/billing", "/billing")
    ]);
  });

  test("keeps a subfolder under its parent when a sibling name shares the parent's prefix", () => {
    expect(buildFolderTree(["/aws", "/aws-prod", "/aws/s3", "/aws_dev"])).toEqual([
      { path: "/aws", label: "/aws", children: [leaf("/aws/s3", "s3")] },
      leaf("/aws_dev", "/aws_dev"),
      leaf("/aws-prod", "/aws-prod")
    ]);
  });

  test("nests under the closest listed folder when the folders between are not listed", () => {
    expect(buildFolderTree(["/aws/s3/credentials", "/aws/rds/credentials", "/aws"])).toEqual([
      {
        path: "/aws",
        label: "/aws",
        children: [
          leaf("/aws/rds/credentials", "rds/credentials"),
          leaf("/aws/s3/credentials", "s3/credentials")
        ]
      }
    ]);
  });

  test("shows full paths when no folder holds another", () => {
    expect(buildFolderTree(["/aws/s3/credentials", "/aws/rds/credentials"])).toEqual([
      leaf("/aws/rds/credentials", "/aws/rds/credentials"),
      leaf("/aws/s3/credentials", "/aws/s3/credentials")
    ]);
  });
});
