import { describe, expect, test } from "vitest";

import { PamAccountType } from "../pam/pam-enums";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";
import { buildWebResourceTemplateBackfillRows, WEB_RESOURCE_DEFAULT_TEMPLATE } from "./pam-project-template-backfill";

describe("web resource template backfill", () => {
  test("builds one default web-resource template row per PAM project", () => {
    expect(buildWebResourceTemplateBackfillRows(["project-a", "project-b"])).toEqual([
      {
        projectId: "project-a",
        name: "web-resource",
        type: PamAccountType.WebResource,
        settings: {
          recordingEnabled: true,
          recordingStorageBackend: PamRecordingStorageBackend.Postgres
        }
      },
      {
        projectId: "project-b",
        name: "web-resource",
        type: PamAccountType.WebResource,
        settings: {
          recordingEnabled: true,
          recordingStorageBackend: PamRecordingStorageBackend.Postgres
        }
      }
    ]);
  });

  test("matches the bootstrapped default template settings", () => {
    expect(WEB_RESOURCE_DEFAULT_TEMPLATE).toEqual({
      name: "web-resource",
      type: PamAccountType.WebResource,
      settings: {
        recordingEnabled: true,
        recordingStorageBackend: PamRecordingStorageBackend.Postgres
      }
    });
  });
});
