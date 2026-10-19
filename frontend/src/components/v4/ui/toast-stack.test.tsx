// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ToastStack } from "./toast-stack";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
it("pauses auto-dismiss while a toast action has focus and resumes its remaining lifetime", async () => {
  const dismiss = vi.fn();
  await React.act(async () =>
    root.render(
      <>
        <ToastStack
          inline
          items={[
            { id: "saved", title: "Secret saved", action: { label: "Undo", onClick: vi.fn() } }
          ]}
          onDismiss={dismiss}
        />
        <button type="button" id="outside">
          Outside
        </button>
      </>
    )
  );
  await React.act(async () => vi.advanceTimersByTime(2000));
  await React.act(async () =>
    host.querySelector<HTMLButtonElement>('[data-slot="toast"] button')?.focus()
  );
  await React.act(async () => vi.advanceTimersByTime(20000));
  expect(dismiss).not.toHaveBeenCalled();
  await React.act(async () => host.querySelector<HTMLButtonElement>("#outside")?.focus());
  await React.act(async () => vi.advanceTimersByTime(2999));
  expect(dismiss).not.toHaveBeenCalled();
  await React.act(async () => vi.advanceTimersByTime(1));
  expect(dismiss).toHaveBeenCalledWith("saved");
});
it("keeps error and loading toasts persistent even when a duration is provided", async () => {
  const dismiss = vi.fn();
  await React.act(async () =>
    root.render(
      <ToastStack
        inline
        items={[
          { id: "failed", title: "Sync failed", tone: "bad", duration: 100 },
          { id: "loading", title: "Syncing", tone: "loading", duration: 100 }
        ]}
        onDismiss={dismiss}
      />
    )
  );
  await React.act(async () => vi.advanceTimersByTime(20000));
  expect(dismiss).not.toHaveBeenCalled();
});
