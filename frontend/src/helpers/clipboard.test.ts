import { afterEach, describe, expect, it, vi } from "vitest";

import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the Clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyToClipboard("invitation-link");

    expect(writeText).toHaveBeenCalledWith("invitation-link");
  });

  it("falls back to the legacy copy command when Clipboard API access fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Not allowed"));
    const textArea = {
      value: "",
      setAttribute: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
      style: { position: "", opacity: "" }
    };
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(textArea),
      body: { appendChild: vi.fn() },
      execCommand
    });

    await copyToClipboard("invitation-link");

    expect(textArea.value).toBe("invitation-link");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(textArea.remove).toHaveBeenCalled();
  });

  it("throws when neither copy mechanism succeeds", async () => {
    const textArea = {
      value: "",
      setAttribute: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
      style: { position: "", opacity: "" }
    };
    const execCommand = vi.fn().mockReturnValue(false);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(textArea),
      body: { appendChild: vi.fn() },
      execCommand
    });

    await expect(copyToClipboard("invitation-link")).rejects.toThrow(
      "Clipboard access is unavailable"
    );
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(textArea.remove).toHaveBeenCalled();
  });

  it("removes the fallback element when the copy command throws", async () => {
    const textArea = {
      value: "",
      setAttribute: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
      style: { position: "", opacity: "" }
    };
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(textArea),
      body: { appendChild: vi.fn() },
      execCommand: vi.fn().mockImplementation(() => {
        throw new Error("Not allowed");
      })
    });

    await expect(copyToClipboard("invitation-link")).rejects.toThrow("Not allowed");
    expect(textArea.remove).toHaveBeenCalled();
  });
});
