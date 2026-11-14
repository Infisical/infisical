// @vitest-environment jsdom

import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {} from "vitest/jsdom";

import { useLocalStorageState } from "./useLocalStorageState";

type Setter = (value: number | ((previous: number) => number)) => void;

let container: HTMLDivElement;
let root: Root;

const renderStorage = async (tabLocal: boolean) => {
  let setValue: Setter = () => {
    throw new Error("Storage hook has not mounted");
  };

  const Harness = () => {
    const [value, update] = useLocalStorageState("counter", 0, { tabLocal });
    setValue = update;
    return <output>{value}</output>;
  };

  await act(async () => root.render(<Harness />));

  return {
    update: setValue,
    read: () => Number(container.textContent)
  };
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Node's native localStorage can shadow jsdom's storage in the test environment.
  vi.stubGlobal("localStorage", jsdom.window.localStorage);
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe.each([false, true])("useLocalStorageState with tabLocal=%s", (tabLocal) => {
  it("composes two functional updates in one batch", async () => {
    const storage = await renderStorage(tabLocal);

    await act(async () => {
      storage.update((previous) => previous + 1);
      storage.update((previous) => previous + 1);
    });

    expect(storage.read()).toBe(2);
    expect(window.localStorage.getItem("counter")).toBe("2");
  });

  it("applies a functional update after a direct write in one batch", async () => {
    const storage = await renderStorage(tabLocal);

    await act(async () => {
      storage.update(10);
      storage.update((previous) => previous + 1);
    });

    expect(storage.read()).toBe(11);
    expect(window.localStorage.getItem("counter")).toBe("11");
  });

  it("uses another tab's write only for shared storage", async () => {
    const storage = await renderStorage(tabLocal);

    await act(async () => {
      window.localStorage.setItem("counter", "10");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "counter",
          newValue: "10",
          storageArea: window.localStorage
        })
      );
    });

    await act(async () => storage.update((previous) => previous + 1));

    const expected = tabLocal ? 1 : 11;
    expect(storage.read()).toBe(expected);
    expect(window.localStorage.getItem("counter")).toBe(String(expected));
  });
});
