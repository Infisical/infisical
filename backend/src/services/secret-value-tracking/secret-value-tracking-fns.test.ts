import { advanceCursor, needsBackfill } from "./secret-value-tracking-fns";

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

  // Folder ids are sorted, so resuming past the deleted one keeps the walk moving forward instead of
  // re-reading everything the run already covered in that project.
  test("a cursor on a deleted folder resumes at the next folder after it, not at the first", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "f1a", key: "M", id: "s5" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: false
      })
    ).toEqual({ done: false, cursor: { projectId: "p1", folderId: "f2", key: "", id: "" }, completedProjectId: null });
  });

  test("a cursor on a deleted folder past the project's last one moves to the next project", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "zz-gone", key: "M", id: "s5" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: false
      })
    ).toEqual({ done: false, cursor: { projectId: "p2", folderId: "f3", key: "", id: "" }, completedProjectId: "p1" });
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
