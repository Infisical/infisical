import { describe, expect, it, vi } from "vitest";

import { attachConsoleReporter, RunEvents, type RunEvent } from "../src/run/events.js";

/**
 * The event stream is the only thing the dashboard sees, and a reconnecting client rebuilds its
 * entire view from `replay()`. So the buffering rules are not an implementation detail: each of the
 * assertions below corresponds to something a viewer actually saw go wrong.
 */

const START = {
  guide: "docs/documentation/platform/folder.mdx",
  title: "Folders",
  baseUrl: "http://localhost:8080",
  fixture: "project",
  totalSteps: 5
};

const captureStdout = (fn: () => void): string => {
  let written = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written += String(chunk);
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return written;
};

describe("RunEvents history", () => {
  it("keeps an earlier guide's events when a second guide starts", () => {
    // A flat buffer made the client wipe guide 1 the moment guide 2's run_started arrived, so a
    // multi-guide walk could only ever show the last guide.
    const events = new RunEvents();
    events.runStarted(START);
    events.log("first");
    events.runStarted({ ...START, guide: "docs/other.mdx", title: "Other" });
    events.log("second");

    const logs = events.replay().filter((event) => event.type === "log");
    expect(logs).toHaveLength(2);
    expect(events.replay().filter((event) => event.type === "run_started")).toHaveLength(2);
  });

  it("gives each run a distinct id", () => {
    const events = new RunEvents();
    const first = events.runStarted(START);
    const second = events.runStarted(START);
    expect(first).not.toBe(second);
  });

  it("never evicts run_started, however much chatter follows", () => {
    // The worst version of the old bug: overflow dropped run_started *first*, so a client that
    // connected late received a stream of steps with no idea which guide they belonged to and
    // appended them onto whatever was already on screen.
    const events = new RunEvents();
    events.runStarted(START);
    events.runPlan([
      { index: 1, heading: "Create a folder", steps: [] }
    ]);
    for (let index = 0; index < 600; index += 1) events.log(`log ${index}`);

    const replayed = events.replay();
    expect(replayed[0]?.type).toBe("run_started");
    expect(replayed[1]?.type).toBe("run_plan");
    // The tail is capped, so the oldest chatter is gone while the header is not.
    expect(replayed.filter((event) => event.type === "log").length).toBeLessThan(600);
  });

  it("keeps events emitted before any run started", () => {
    const events = new RunEvents();
    events.log("bootstrapping");
    events.runStarted(START);
    expect(events.replay()[0]).toEqual({ type: "log", text: "bootstrapping" });
  });

  it("holds only the newest frame, and replays it last", () => {
    // Frames are ~40KB of base64 each at several per second. Buffering them would push every
    // other event out of history and make replay enormous for no benefit: only the current
    // picture is worth anything to a client that just connected.
    const events = new RunEvents();
    events.runStarted(START);
    events.frame("aaa");
    events.log("after the frame");
    events.frame("bbb");

    const replayed = events.replay();
    const frames = replayed.filter((event) => event.type === "frame");
    expect(frames).toEqual([{ type: "frame", jpegBase64: "bbb" }]);
    expect(replayed[replayed.length - 1]).toBe(frames[0]);
  });

  it("pairs each tool result with the call that produced it", () => {
    const events = new RunEvents();
    const first = events.toolCall("click", "Add");
    const second = events.toolCall("fill", "Name");
    expect(first).not.toBe(second);

    events.toolResult(first, "click", true, "clicked");
    const results = events.replay().filter((event) => event.type === "tool_result");
    expect(results[0]).toMatchObject({ id: first, name: "click", ok: true });
  });

  it("delivers every event to a live listener, frames included", () => {
    const events = new RunEvents();
    const seen: RunEvent[] = [];
    const off = events.on((event) => seen.push(event));
    events.runStarted(START);
    events.frame("aaa");
    events.log("x");
    off();
    events.log("not seen");

    expect(seen.map((event) => event.type)).toEqual(["run_started", "frame", "log"]);
  });
});

describe("attachConsoleReporter", () => {
  it("prints a tool call as name then argument", () => {
    // name and arg became separate fields on the wire; the terminal line must not change.
    const events = new RunEvents();
    const output = captureStdout(() => {
      attachConsoleReporter(events);
      events.toolCall("click", "Add Folder");
      events.toolCall("snapshot");
    });
    expect(output).toContain("click Add Folder");
    expect(output).toContain("snapshot\n");
    expect(output).not.toContain("snapshot undefined");
  });

  it("prints a failed tool but stays quiet about a successful one", () => {
    // A successful tool is already implied by its call line; a failure used to be invisible.
    const events = new RunEvents();
    const output = captureStdout(() => {
      attachConsoleReporter(events);
      const id = events.toolCall("click", "Add");
      events.toolResult(id, "click", true, "clicked");
      events.toolResult(2, "fill", false, "no field named Name");
    });
    expect(output).toContain("x fill: no field named Name");
    expect(output).not.toContain("clicked");
  });

  it("prints the composite key so two different step 1s are distinguishable", () => {
    const events = new RunEvents();
    const output = captureStdout(() => {
      attachConsoleReporter(events);
      events.stepStarted(1, 1, "Open the project", "agent");
      events.stepStarted(2, 1, "Open the folder", "replay");
    });
    expect(output).toContain("step 1.1 [agent] Open the project");
    expect(output).toContain("step 2.1 [replay] Open the folder");
  });

  it("stops printing once detached", () => {
    const events = new RunEvents();
    const output = captureStdout(() => {
      const off = attachConsoleReporter(events);
      off();
      events.log("quiet");
    });
    expect(output).toBe("");
  });
});
