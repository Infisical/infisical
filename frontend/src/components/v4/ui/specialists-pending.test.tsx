// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

import { DataTable } from "./data-table";
import { CopyButton, SensitiveEditor } from "./sensitive-editor";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
});
const button = (name: string) => {
  const found = Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent === name
  );
  if (!found) throw new Error(`Missing ${name}`);
  return found;
};
const unresolved = () => new Promise<void>(() => {});
it("announces a pending table load and keeps its action name", async () => {
  await React.act(async () =>
    root.render(
      <DataTable
        label="Pending rows"
        rows={[]}
        columns={[]}
        getRowId={() => ""}
        rowLabel={() => ""}
        loadMore={{ label: "Load rows", loading: true, onClick: () => {} }}
      />
    )
  );
  expect(button("Load rows").getAttribute("aria-busy")).toBe("true");
});
it("announces copy pending before the writer completes", async () => {
  await React.act(async () =>
    root.render(<CopyButton value="fabricated" writeClipboard={unresolved} />)
  );
  await React.act(async () => button("Copy value").click());
  expect(button("Copy value").getAttribute("aria-busy")).toBe("true");
});
it("announces pending reveal and replacement requests", async () => {
  const stored = { id: "fabricated", revision: "1", hasValue: true };
  await React.act(async () =>
    root.render(
      <SensitiveEditor
        label="Pending secret"
        stored={stored}
        onReveal={() => new Promise<string>(() => {})}
        onSave={unresolved}
      />
    )
  );
  await React.act(async () => button("Reveal value").click());
  expect(button("Reveal value").getAttribute("aria-busy")).toBe("true");
  await React.act(async () => button("Replace without viewing").click());
  await React.act(async () => button("Save replacement").click());
  expect(button("Save replacement").getAttribute("aria-busy")).toBe("true");
});
