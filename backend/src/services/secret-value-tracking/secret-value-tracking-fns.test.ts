import { JobState } from "@app/queue/queue-service";

import { advanceCursor, needsBackfill, resolveRunStatus } from "./secret-value-tracking-fns";
import { TBackfillRunState } from "./secret-value-tracking-types";

const PROJECTS = ["p1", "p2"];
const FOLDERS = { p1: ["f1", "f2"], p2: ["f3"] };

describe("advanceCursor", () => {
  test("a null cursor starts at the first folder of the first project", () => {
    expect(
      advanceCursor({
        cursor: null,
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: false
      })
    ).toEqual({ done: false, cursor: { projectId: "p1", folderId: "f1", key: "", id: "" }, completedProjectId: null });
  });

  test("a partly read folder advances within itself", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "f1", key: "A", id: "s1" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: { key: "B", id: "s2" },
        folderExhausted: false
      })
    ).toEqual({
      done: false,
      cursor: { projectId: "p1", folderId: "f1", key: "B", id: "s2" },
      completedProjectId: null
    });
  });

  test("an exhausted folder moves to the next folder of the same project", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "f1", key: "Z", id: "s9" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: true
      })
    ).toEqual({ done: false, cursor: { projectId: "p1", folderId: "f2", key: "", id: "" }, completedProjectId: null });
  });

  test("the last folder of a project reports the project complete and moves to the next project", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "f2", key: "Z", id: "s9" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: true
      })
    ).toEqual({ done: false, cursor: { projectId: "p2", folderId: "f3", key: "", id: "" }, completedProjectId: "p1" });
  });

  test("the last folder of the last project ends the walk", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p2", folderId: "f3", key: "Z", id: "s9" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: true
      })
    ).toEqual({ done: true });
  });

  // An empty folder must not leave the cursor where it was, or the walk spins on it forever.
  test("an empty folder advances rather than repeating itself", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "f1", key: "", id: "" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: true
      })
    ).toEqual({ done: false, cursor: { projectId: "p1", folderId: "f2", key: "", id: "" }, completedProjectId: null });
  });

  test("a cursor on a deleted folder resumes at the next folder of that project", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "gone", key: "M", id: "s5" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: false
      })
    ).toEqual({ done: false, cursor: { projectId: "p1", folderId: "f1", key: "", id: "" }, completedProjectId: null });
  });

  test("a cursor on a deleted project resumes at the next project", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "gone", folderId: "gone", key: "M", id: "s5" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: false
      })
    ).toEqual({ done: false, cursor: { projectId: "p1", folderId: "f1", key: "", id: "" }, completedProjectId: null });
  });

  test("a project with no folders is skipped", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "f2", key: "Z", id: "s9" },
        projectIds: ["p1", "empty", "p2"],
        folderIdsByProject: { ...FOLDERS, empty: [] },
        lastRow: null,
        folderExhausted: true
      })
    ).toEqual({ done: false, cursor: { projectId: "p2", folderId: "f3", key: "", id: "" }, completedProjectId: "p1" });
  });

  test("an organization with no projects is immediately done", () => {
    expect(
      advanceCursor({ cursor: null, projectIds: [], folderIdsByProject: {}, lastRow: null, folderExhausted: false })
    ).toEqual({ done: true });
  });
});

describe("needsBackfill", () => {
  test("a row missing the org digest needs work", () => {
    expect(
      needsBackfill({ secretValueBlindIndex: "abc", secretValueOrgBlindIndex: null, encryptedValue: Buffer.from("x") })
    ).toBe(true);
  });

  test("a row missing the project digest needs work", () => {
    expect(
      needsBackfill({ secretValueBlindIndex: null, secretValueOrgBlindIndex: "abc", encryptedValue: Buffer.from("x") })
    ).toBe(true);
  });

  test("a row with both digests is skipped", () => {
    expect(
      needsBackfill({ secretValueBlindIndex: "a", secretValueOrgBlindIndex: "b", encryptedValue: Buffer.from("x") })
    ).toBe(false);
  });

  test("a row with no encrypted value is skipped even when digests are missing", () => {
    expect(needsBackfill({ secretValueBlindIndex: null, secretValueOrgBlindIndex: null, encryptedValue: null })).toBe(
      false
    );
  });
});

const NOW = new Date("2026-09-24T12:00:00.000Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

const running = (lastProgressAt: string): TBackfillRunState => ({
  status: "running",
  cursor: null,
  projectsTotal: 3,
  projectsDone: 1,
  secretsProcessed: 10,
  lastProgressAt
});

describe("resolveRunStatus", () => {
  test("the flag being set means completed, whatever the key says", () => {
    expect(resolveRunStatus(running(minutesAgo(1)), true, NOW)).toEqual({ status: JobState.Completed });
  });

  test("no key and no flag means the backfill was never run", () => {
    expect(resolveRunStatus(null, false, NOW)).toEqual({ status: JobState.NotFound });
  });

  test("a run that progressed recently is pending", () => {
    expect(resolveRunStatus(running(minutesAgo(1)), false, NOW)).toEqual({ status: JobState.Pending });
  });

  test("a recorded failure reports its error", () => {
    expect(
      resolveRunStatus({ ...running(minutesAgo(1)), status: "failed", error: "kms unavailable" }, false, NOW)
    ).toEqual({ status: JobState.Failed, message: "kms unavailable" });
  });

  test("a run with no progress for longer than the window is stalled", () => {
    const result = resolveRunStatus(running(minutesAgo(30)), false, NOW);
    expect(result.status).toBe(JobState.Failed);
    expect(result.message).toMatch(/stopped responding/i);
  });

  // The boundary must be decisive rather than flapping between running and stalled.
  test("exactly at the staleness boundary the run still counts as pending", () => {
    expect(resolveRunStatus(running(minutesAgo(15)), false, NOW)).toEqual({ status: JobState.Pending });
  });

  test("one second past the boundary the run is stalled", () => {
    const justPast = new Date(NOW.getTime() - (15 * 60_000 + 1000)).toISOString();
    expect(resolveRunStatus(running(justPast), false, NOW).status).toBe(JobState.Failed);
  });

  // An unreadable timestamp must not throw into the status endpoint.
  test("an unparseable lastProgressAt reads as stalled rather than throwing", () => {
    expect(resolveRunStatus({ ...running(""), lastProgressAt: "not-a-date" }, false, NOW).status).toBe(JobState.Failed);
  });
});
