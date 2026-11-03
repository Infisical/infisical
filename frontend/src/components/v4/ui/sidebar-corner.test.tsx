// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

import { V4Scope } from "../scope";
import { Sidebar } from "./sidebar";

it("shows the announcements trigger beside help only while something is unread", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (unread: number) =>
    act(() =>
      root.render(
        <V4Scope>
          <Sidebar
            sections={[{ items: [{ id: "home", label: "Home", icon: "home" }] }]}
            help={{ items: [] }}
            announcements={{ unread, onClick: () => {} }}
          />
        </V4Scope>
      )
    );
  const corner = () =>
    [...host.querySelectorAll<HTMLElement>("aside button[aria-label]")].map((button) =>
      button.getAttribute("aria-label")
    );
  render(2);
  expect(corner()).toEqual(
    expect.arrayContaining(["Collapse sidebar", "What's new, 2 unread", "Help"])
  );
  render(0);
  expect(corner()).not.toContain("What's new, 2 unread");
  expect(corner()).toEqual(expect.arrayContaining(["Collapse sidebar", "Help"]));
  act(() => root.unmount());
  host.remove();
});
