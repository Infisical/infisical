// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Resource } from "../../secrets-model";
import { MoveSecretsDialog } from "./move-secrets-dialog";

vi.mock("@app/components/v4/ui/dialog", () => {
  const Section = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  return {
    Dialog: Section,
    DialogContent: Section,
    DialogHeader: Section,
    DialogTitle: Section,
    DialogDescription: Section,
    DialogFooter: Section
  };
});
vi.mock("@app/components/v4/ui/button", () => ({
  Button: ({ children, onClick, disabled }: React.ComponentProps<"button">) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}));
vi.mock("@app/components/v4/ui/alert", () => ({
  Alert: ({ children }: React.PropsWithChildren) => <div>{children}</div>
}));
vi.mock("@app/components/v4/ui/combobox", () => ({ Combobox: () => null }));
vi.mock("@app/components/v4/ui/field", () => ({ FieldError: () => null }));
vi.mock("@app/components/v4/ui/icon", () => ({ Icon: () => null }));
vi.mock("@app/components/v4/ui/input", () => ({ Input: () => null }));
vi.mock("@app/components/v4/ui/select", () => ({ Select: () => null }));
vi.mock("@app/components/v4/ui/switch", () => ({ Switch: () => null }));
vi.mock("@app/components/v4/ui/text", () => ({
  SmallText: ({ children }: React.PropsWithChildren) => <span>{children}</span>
}));
vi.mock("@app/components/v4/ui/tooltip", () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => children
}));
vi.mock("../flows/shared", () => ({
  childPath: (path: string, name: string) => `${path === "/" ? "" : path}/${name}`
}));

const base = {
  project: "project-id",
  environment: "dev",
  path: "/source",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
};
const secret: Resource = {
  ...base,
  kind: "secret",
  id: "secret-id",
  name: "API_KEY",
  value: { status: "unreadable" },
  version: 1,
  comment: "",
  tags: [],
  metadata: []
};
const folder: Resource = {
  ...base,
  kind: "folder",
  id: "folder-id",
  name: "child",
  description: ""
};
const rotation: Resource = {
  ...base,
  kind: "rotation",
  id: "rotation-id",
  name: "database",
  provider: "test",
  connection: "test",
  status: "success",
  autoRotation: false,
  lastRotatedAt: base.createdAt,
  managedKeys: ["DB_KEY"]
};
const managed: Resource = { ...secret, id: "managed-id", name: "DB_KEY", managedBy: rotation.name };
const environments = [
  { value: "dev", label: "Development" },
  { value: "prod", label: "Production" }
];
let root: Root;
let host: HTMLDivElement;
const onApply = vi.fn();
const onFoldersMoved = vi.fn();
const onToast = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.clearAllMocks();
});
afterEach(() => {
  React.act(() => root.unmount());
  host.remove();
});
const render = (targets: Resource[], single = false) => {
  React.act(() =>
    root.render(
      <MoveSecretsDialog
        open
        targets={targets}
        resources={[secret, folder, rotation, managed]}
        scope={{
          project: base.project,
          path: base.path,
          environments,
          visibleEnvironments: single ? [environments[0]] : environments
        }}
        onClose={vi.fn()}
        onApply={onApply}
        onToast={onToast}
        onFoldersMoved={onFoldersMoved}
      />
    )
  );
};
const submit = (label: string) => {
  const button = [...host.querySelectorAll("button")].find((entry) => entry.textContent === label);
  expect(button).toBeDefined();
  React.act(() => button?.click());
};

it("rejects a rotation in planning while retaining secret and folder moves", () => {
  render([secret, folder, rotation]);
  submit("Move items");
  expect(onApply).toHaveBeenCalledOnce();
  const next = onApply.mock.calls[0][0]([secret, folder, rotation, managed]) as Resource[];
  expect(next.find(({ id }) => id === secret.id)?.path).toBe("/");
  expect(next.find(({ id }) => id === folder.id)?.path).toBe("/");
  expect(next.find(({ id }) => id === rotation.id)).toBe(rotation);
  expect(next.find(({ id }) => id === managed.id)).toBe(managed);
  expect(host.querySelector('[data-status="error"]')?.textContent).toContain(
    'Secret rotation "database" cannot be moved here yet.'
  );
  expect(host.textContent).not.toContain("Secret rotation moved.");
  expect(onFoldersMoved).toHaveBeenCalledExactlyOnceWith([
    { environment: "dev", destinationEnvironment: "dev", from: "/source/child", to: "/child" }
  ]);
});

it("does not apply or report success for a rotation-only selection", () => {
  render([rotation]);
  submit("Move secrets");
  expect(onApply).not.toHaveBeenCalled();
  expect(onFoldersMoved).not.toHaveBeenCalled();
  expect(host.querySelector('[data-status="success"]')).toBeNull();
  expect(host.querySelector('[data-status="error"]')?.textContent).toContain("cannot be moved");
});

it("keeps supported single-environment moves and reports the rotation failure", () => {
  render([secret, folder, rotation], true);
  submit("Move items");
  expect(onApply).toHaveBeenCalledTimes(2);
  for (const [update] of onApply.mock.calls) {
    const next = update([secret, folder, rotation, managed]) as Resource[];
    expect(next.find(({ id }) => id === rotation.id)).toBe(rotation);
    expect(next.find(({ id }) => id === managed.id)).toBe(managed);
  }
  expect(onToast).toHaveBeenCalledWith(
    "bad",
    expect.objectContaining({ title: expect.stringContaining("Failed to move 1 secret rotation") })
  );
});
