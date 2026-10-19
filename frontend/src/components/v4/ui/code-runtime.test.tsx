// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Code } from "./code";
import { CodeBlock } from "./code-block";
import { normalizeCodeLanguage, tokenizeCode } from "./code-tokenizer";
import { Field } from "./field";
import { Json, prepareJson } from "./json";
import { Snippet } from "./snippet";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
const render = async (children: React.ReactNode) => {
  await React.act(async () => root.render(children));
};
const clickCopy = async () => {
  await React.act(async () => host.querySelector<HTMLButtonElement>("button")?.click());
};

describe("code rendering and clipboard integrity", () => {
  it("redacts keys recursively, case-insensitively and through arrays before rendering or copying", async () => {
    const payload = {
      token: "root-secret",
      nested: [{ TOKEN: "nested-secret", ok: true }],
      text: "<script>alert(1)</script>"
    };
    const original = JSON.stringify(payload);
    const write = vi.fn().mockResolvedValue(undefined);
    await render(
      <CodeBlock label="Payload" copyValue="unsafe override" writeClipboard={write}>
        <Json value={payload} redact={["token"]} />
      </CodeBlock>
    );
    expect(host.innerHTML).not.toContain("root-secret");
    expect(host.innerHTML).not.toContain("nested-secret");
    expect(host.querySelector("script")).toBeNull();
    await clickCopy();
    const copied = write.mock.calls[0][0];
    expect(JSON.parse(copied)).toEqual({
      token: "<redacted>",
      nested: [{ TOKEN: "<redacted>", ok: true }],
      text: "<script>alert(1)</script>"
    });
    expect(copied).not.toContain("unsafe override");
    expect(JSON.stringify(payload)).toBe(original);
  });
  it("preserves malformed JSON as literal text and does not claim to redact an unparsed string", async () => {
    const value = '{"token": "incomplete';
    expect(prepareJson(value)).toEqual({ value, text: value, parsed: false });
    expect(prepareJson(value, ["token"]).text).toBe("<redacted>");
    await render(<Json value={value} label="Raw response" />);
    expect(host.querySelector("code")?.textContent).toBe(value);
  });
  it("copies exact code without line numbers, including trailing newlines and blank lines", async () => {
    const source = "first\n\nthird\n";
    const write = vi.fn().mockResolvedValue(undefined);
    await render(<CodeBlock code={source} lineNumbers writeClipboard={write} />);
    expect(host.querySelectorAll('[aria-hidden="true"]')).not.toHaveLength(0);
    await clickCopy();
    expect(write).toHaveBeenCalledWith(source);
    await render(
      <Snippet
        value="infisical run -- npm start"
        prompt="$"
        label="Command"
        writeClipboard={write}
      />
    );
    await clickCopy();
    expect(write).toHaveBeenLastCalledWith("infisical run -- npm start");
  });
  it("announces success only after fulfillment and preserves error feedback on rejection", async () => {
    let resolve: (() => void) | undefined;
    const write = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );
    const notify = vi.fn();
    await render(<CodeBlock code="safe" writeClipboard={write} onCopy={notify} />);
    await clickCopy();
    expect(notify).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Copied");
    await React.act(async () => resolve?.());
    expect(notify).toHaveBeenCalledWith("safe");
    expect(host.textContent).toContain("Copied");
    await render(
      <CodeBlock
        key="failed"
        code="safe"
        writeClipboard={() => Promise.reject(new Error("Denied"))}
        onCopy={notify}
      />
    );
    await clickCopy();
    expect(host.textContent).not.toContain("Copied");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Copy failed");
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it("retains JSON number tokens exactly through redaction and copy", async () => {
    const source =
      '{"id":9007199254740993,"decimal":0.123456789012345678901,"token":{"nested":"secret"}}';
    const safe = prepareJson(source, ["token"]);
    expect(safe.text).toBe(
      '{"id":9007199254740993,"decimal":0.123456789012345678901,"token":"<redacted>"}'
    );
    await render(<Json value={source} redact={["token"]} />);
    expect(host.textContent).toContain("9007199254740993");
    expect(host.textContent).toContain("0.123456789012345678901");
    expect(host.textContent).not.toContain("secret");
  });
  it("bounds the preview while retaining the exact safe copy source", async () => {
    const source = JSON.stringify(Array.from({ length: 1000 }, (_, index) => index));
    const write = vi.fn().mockResolvedValue(undefined);
    await render(
      <CodeBlock writeClipboard={write}>
        <Json value={source} maxNodes={12} />
      </CodeBlock>
    );
    expect(host.textContent).toContain("Preview limit reached");
    expect(host.querySelectorAll('[data-slot="animated-collapse"]')).toHaveLength(1);
    await clickCopy();
    expect(write).toHaveBeenCalledWith(source);
    const deep = `${"[".repeat(150)}0${"]".repeat(150)}`;
    expect(prepareJson(deep).text).toBe(deep);
    expect(prepareJson(deep).notice).toContain("inspection limits");
    expect(prepareJson(deep, ["token"]).text).toBe("<redacted>");
  });
  it("tokenizes the supported aliases as text and preserves blank lines for manual copy", async () => {
    [
      ["sh", "# comment\necho 'hello'"],
      ["env", "KEY=value"],
      ["json", '{"key":true}'],
      ["yaml", "key: true"],
      ["ts", "const value = 42"],
      ["py", "def example():"],
      ["tf", 'resource "test" {}']
    ].forEach(([alias, code]) => {
      const tokens = tokenizeCode(code, alias);
      expect(tokens.map((token) => token.text).join("")).toBe(code);
      expect(tokens.some((token) => token.kind !== "plain")).toBe(true);
    });
    expect(normalizeCodeLanguage("unknown")).toBe("plain");
    const source = "first\n\n<script>bad</script>\n";
    await render(<Code block language="ts" code={source} />);
    expect(host.querySelector("code")?.textContent).toBe(source);
    expect(host.querySelector("script")).toBeNull();
    expect(host.textContent).not.toContain("\u200b");
  });
  it("forwards the snippet input ref and inherits its Field association", async () => {
    const ref = React.createRef<HTMLInputElement>();
    await render(
      <Field label="Command" description="Run in your terminal">
        <Snippet ref={ref} value="infisical run" label="Command" copyable={false} />
      </Field>
    );
    expect(ref.current?.tagName).toBe("INPUT");
    expect(host.querySelector("label")?.htmlFor).toBe(ref.current?.id);
    expect(
      document.getElementById(ref.current?.getAttribute("aria-describedby") ?? "")?.textContent
    ).toBe("Run in your terminal");
  });
});
