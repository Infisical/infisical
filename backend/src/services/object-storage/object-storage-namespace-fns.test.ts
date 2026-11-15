import { describe, expect, test } from "vitest";

import { ProjectType } from "@app/db/schemas";

import { assertNamespacesValid, defineStorageNamespace } from "./object-storage-namespace-fns";

const ns = (id: string, path: string, product = ProjectType.AgentVault) =>
  defineStorageNamespace({ id, product, path });

describe("defining a namespace", () => {
  test("its path must end in {file}", () => {
    expect(() => ns("a", "sessions/{sessionId}/logs")).toThrow("must end in /{file}");
  });

  test("its pieces are fixed words or {ids}", () => {
    expect(() => ns("a", "sessions/{session id}/logs/{file}")).toThrow();
    expect(ns("a", "sessions/{sessionId}/logs/{file}").segments).toEqual([
      { kind: "word", value: "sessions" },
      { kind: "id", name: "sessionId" },
      { kind: "word", value: "logs" }
    ]);
  });
});

describe("the startup checks", () => {
  test.each([
    { why: "words and ids take turns", path: "sessions/{sessionId}/logs/{file}" },
    { why: "many ids may follow the last word", path: "monthly/{year}/{month}/{day}/{file}" },
    { why: "a single word", path: "exports/{file}" }
  ])("accepts a path where $why", ({ path }) => {
    expect(() => assertNamespacesValid([ns("a", path)])).not.toThrow();
  });

  test.each([
    {
      why: "two words in a row, so an id could equal the second word",
      path: "requests/exports/{exportId}/{file}"
    },
    { why: "an id before any word", path: "{sessionId}/logs/{file}" },
    { why: "two ids before the last word", path: "sessions/{a}/{b}/logs/{file}" },
    { why: "no fixed word at all", path: "{file}" }
  ])("refuses a path with $why", ({ path }) => {
    expect(() => assertNamespacesValid([ns("a", path)])).toThrow();
  });

  test("refuses a namespace whose last word another namespace of the product uses", () => {
    expect(() =>
      assertNamespacesValid([
        ns("agent-vault.session-logs", "sessions/{sessionId}/logs/{file}"),
        ns("agent-vault.attachments", "sessions/{sessionId}/{file}")
      ])
    ).toThrow('ends in "sessions"');
  });

  test("allows a word of its own beside another namespace", () => {
    expect(() =>
      assertNamespacesValid([
        ns("agent-vault.session-logs", "sessions/{sessionId}/logs/{file}"),
        ns("agent-vault.attachments", "sessions/{sessionId}/attachments/{file}")
      ])
    ).not.toThrow();
  });

  test("products don't constrain each other", () => {
    expect(() =>
      assertNamespacesValid([
        ns("agent-vault.session-logs", "sessions/{sessionId}/logs/{file}"),
        ns("pam.recordings", "sessions/{sessionId}/{file}", ProjectType.PAM)
      ])
    ).not.toThrow();
  });

  test("refuses the same id twice", () => {
    expect(() => assertNamespacesValid([ns("a", "x/{file}"), ns("a", "y/{file}")])).toThrow("registered twice");
  });
});
