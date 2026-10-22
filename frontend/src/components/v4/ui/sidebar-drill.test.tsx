// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

import { V4Scope } from "../scope";
import { Sidebar } from "./sidebar";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  React.act(() => root.unmount());
  host.remove();
});

const sections = [
  {
    items: [
      { id: "home", label: "Home", icon: "home" as const },
      { id: "projects", label: "Projects", icon: "folder" as const, count: 2, drillIn: true }
    ]
  },
  { label: "Administration", items: [{ id: "audit", label: "Audit logs" }] }
];

it("marks drill-in rows with a trailing chevron after the count and a description", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Sidebar sections={sections} current="home" collapsible={false} />
      </V4Scope>
    )
  );
  const rows = [...host.querySelectorAll<HTMLElement>("[data-sidebar-target]")];
  const projects = rows.find((row) => row.textContent?.startsWith("Projects"));
  const home = rows.find((row) => row.textContent === "Home");
  expect(projects?.getAttribute("aria-description")).toBe("Opens section");
  expect(projects?.getAttribute("aria-label")).toBeNull();
  const last = projects?.lastElementChild;
  expect(last?.tagName.toLowerCase()).toBe("svg");
  expect(last?.previousElementSibling?.textContent).toBe("");
  expect(projects?.textContent).toBe("Projects2");
  expect(home?.getAttribute("aria-description")).toBeNull();
  expect(home?.querySelectorAll("svg")).toHaveLength(1);
});

it("renders an unlabeled leading group without an eyebrow", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Sidebar sections={sections} current="home" collapsible={false} />
      </V4Scope>
    )
  );
  const labels = [...host.querySelectorAll("nav p")].map((label) => label.textContent);
  expect(labels).toEqual(["Administration"]);
});
