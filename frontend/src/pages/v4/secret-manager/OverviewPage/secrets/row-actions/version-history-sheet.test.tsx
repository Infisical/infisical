// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Secret } from "../../secrets-model";
import { VersionHistorySheet } from "./version-history-sheet";

const query = vi.hoisted(() => ({
  value: { data: undefined as string | undefined, isPending: true, error: null as unknown },
  redacted: false,
  hidden: false,
  refetch: vi.fn().mockResolvedValue(undefined),
  useValue: vi.fn()
}));

vi.mock("../../../../data/adapters", () => ({
  useV4Adapter: () => ({
    useSecretVersions: () => ({
      isPending: false,
      data: [2, 1].map((version) => ({
        id: `version-${version}`,
        version,
        createdAt: "2026-01-01T00:00:00Z",
        isRedacted: version === 1 && query.redacted,
        secretValueHidden: version === 1 && query.hidden
      }))
    }),
    useSecretVersionValue: (dto: unknown, options: unknown) => {
      query.useValue(dto, options);
      return { ...query.value, refetch: query.refetch };
    }
  })
}));

vi.mock("@app/components/v4/ui/alert-dialog", () => {
  const Section = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  return {
    AlertDialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
      open ? <div role="alertdialog">{children}</div> : null,
    AlertDialogContent: Section,
    AlertDialogHeader: Section,
    AlertDialogTitle: Section,
    AlertDialogDescription: Section,
    AlertDialogFooter: Section,
    AlertDialogCancel: Section,
    AlertDialogAction: ({ children, disabled, onClick }: React.ComponentProps<"button">) => (
      <button type="button" disabled={disabled} onClick={onClick}>
        {children}
      </button>
    )
  };
});
vi.mock("@app/components/v4/ui/sheet", () => {
  const Section = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  return {
    Sheet: Section,
    SheetBody: Section,
    SheetContent: Section,
    SheetDescription: Section,
    SheetHeader: Section,
    SheetSubheader: Section,
    SheetTitle: Section
  };
});
vi.mock("@app/components/v4/ui/button", () => ({
  Button: (props: React.ComponentProps<"button">) => <button type="button" {...props} />
}));
vi.mock("@app/components/v4/ui/badge", () => ({
  Badge: ({ children }: React.PropsWithChildren) => <span>{children}</span>
}));
vi.mock("@app/components/v4/ui/icon", () => ({ Icon: () => null }));
vi.mock("@app/components/v4/ui/loader", () => ({
  Loader: ({ label }: { label: string }) => <span role="status">{label}</span>
}));
vi.mock("@app/components/v4/ui/tooltip", () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => children
}));
vi.mock("../overview-cells", () => ({
  ActionButton: ({
    label,
    onClick,
    disabledReason
  }: {
    label: string;
    onClick: () => void;
    disabledReason?: string;
  }) => (
    <button type="button" disabled={Boolean(disabledReason)} onClick={onClick}>
      {label}
    </button>
  )
}));

let host: HTMLDivElement;
let root: Root;
const onRestore = vi.fn();
const onRedact = vi.fn();

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  query.value = { data: undefined, isPending: true, error: null };
  query.redacted = false;
  query.hidden = false;
  vi.clearAllMocks();
});
afterEach(() => {
  React.act(() => root.unmount());
  host.remove();
});

const render = (id = "secret-1", canRead = true, editBlock?: string) => {
  React.act(() =>
    root.render(
      <VersionHistorySheet
        open
        secret={{ id, name: "TEST_SECRET" } as Secret}
        environmentLabel="Development"
        canRead={canRead}
        editBlock={editBlock}
        onOpenChange={vi.fn()}
        onCopy={vi.fn()}
        onRestore={onRestore}
        onRedact={onRedact}
      />
    )
  );
};
const button = (label: string) => {
  const found = [...host.querySelectorAll("button")].find((item) => item.textContent === label);
  expect(found, `Missing button: ${label}`).toBeDefined();
  return found!;
};
const click = (label: string) => React.act(() => button(label).click());

it("blocks restore while loading, then restores the loaded value once", () => {
  render();
  click("Restore version");
  expect(query.useValue).toHaveBeenCalledWith(
    { secretId: "secret-1", version: 1 },
    { enabled: true }
  );
  expect(button("Restore").disabled).toBe(true);
  expect(host.textContent).toContain("Loading version value");
  click("Restore");
  expect(onRestore).not.toHaveBeenCalled();

  query.value = { data: "fixture-value", isPending: false, error: null };
  render();
  expect(button("Restore").disabled).toBe(false);
  click("Restore");
  click("Restore");
  expect(onRestore).toHaveBeenCalledTimes(1);
  expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }), "fixture-value");
});

it("allows an intentionally empty loaded value", () => {
  query.value = { data: "", isPending: false, error: null };
  render();
  click("Restore version");
  expect(button("Restore").disabled).toBe(false);
  click("Restore");
  expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }), "");
});

it.each([undefined, "previously-cached-value"])(
  "blocks restore after a read error, including cached data: %s",
  (data) => {
    query.value = { data, isPending: false, error: new Error("Read failed") };
    render();
    click("Restore version");
    expect(button("Restore").disabled).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not load");
    click("Restore");
    expect(onRestore).not.toHaveBeenCalled();
  }
);

it("blocks a missing value even when the request is no longer pending", () => {
  query.value.isPending = false;
  render();
  click("Restore version");
  expect(button("Restore").disabled).toBe(true);
  click("Restore");
  expect(onRestore).not.toHaveBeenCalled();
});

it("does not offer restore for a redacted version", () => {
  query.redacted = true;
  query.value = { data: "cached-before-redaction", isPending: false, error: null };
  render();
  expect(host.textContent).not.toContain("Restore version");
  expect(onRestore).not.toHaveBeenCalled();
});

it("closes a previous secret's confirmation on secret switch", () => {
  query.value = { data: "first-secret-value", isPending: false, error: null };
  render();
  click("Restore version");
  expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
  query.value = { data: undefined, isPending: true, error: null };
  render("secret-2");
  expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  click("Restore version");
  expect(button("Restore").disabled).toBe(true);
  click("Restore");
  expect(onRestore).not.toHaveBeenCalled();
});

it("blocks restore if edit permission changes while confirmation is open", () => {
  query.value = { data: "fixture-value", isPending: false, error: null };
  render();
  click("Restore version");
  render("secret-1", true, "Access denied");
  expect(button("Restore").disabled).toBe(true);
  click("Restore");
  expect(onRestore).not.toHaveBeenCalled();
});

it("does not block redaction on the version value request", () => {
  render();
  click("Redact secret value");
  expect(button("Redact").disabled).toBe(false);
  click("Redact");
  expect(onRedact).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
  expect(onRestore).not.toHaveBeenCalled();
});

it("does not restore a historical version whose tags deny read access", () => {
  query.hidden = true;
  query.value = { data: "<hidden-by-infisical>", isPending: false, error: null };
  render();
  expect(host.textContent).not.toContain("Restore version");
  expect(query.useValue).toHaveBeenCalledWith(
    { secretId: "secret-1", version: 1 },
    { enabled: false }
  );
  expect(onRestore).not.toHaveBeenCalled();
  expect(
    [...host.querySelectorAll("button")].filter((item) => item.textContent === "Show value")
  ).toHaveLength(1);
  expect(
    [...host.querySelectorAll("button")].filter((item) => item.textContent === "Copy value")
  ).toHaveLength(1);
  expect(host.textContent).not.toContain("EMPTY");
});

it("fails closed on an ambiguous hidden marker even when list permissions are stale", () => {
  query.value = { data: "<hidden-by-infisical>", isPending: false, error: null };
  render();
  click("Restore version");
  expect(button("Restore").disabled).toBe(true);
  click("Restore");
  expect(onRestore).not.toHaveBeenCalled();
});

it("explicitly retries a failed read after Show kept its query enabled", async () => {
  query.value = { data: undefined, isPending: false, error: new Error("Read failed") };
  render();
  click("Show value");
  click("Restore version");
  await React.act(async () => button("Retry").click());
  expect(query.refetch).toHaveBeenCalledOnce();
  expect(onRestore).not.toHaveBeenCalled();
  query.value = { data: "retry-value", isPending: false, error: null };
  render();
  click("Restore");
  expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }), "retry-value");
});
