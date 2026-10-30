// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "@app/components/v4/scope";

import { CertificateHeaderActions, DeleteCertificateDialog } from "./certificates";

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
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const element = (selector: string) => {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
};

type Cert = React.ComponentProps<typeof CertificateHeaderActions>["cert"];
const cert = (status: Cert["status"]): Cert => ({
  id: "c1",
  cn: "api.acme.dev",
  sans: ["api.acme.dev"],
  serial: "4F:1A",
  status,
  issued: "2026-01-14",
  expires: status === "expired" ? "2026-10-15" : "2027-01-14",
  ca: "Acme Issuing CA G2",
  profile: "tls-server",
  algorithm: "RSA-2048",
  enrollment: "API",
  autoRenew: 30
});
const render = async (status: Cert["status"], onRevoke = vi.fn(), onDelete = vi.fn()) => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <CertificateHeaderActions cert={cert(status)} onRevoke={onRevoke} onDelete={onDelete} />
      </V4Scope>
    )
  );
  return onRevoke;
};
const openMore = async () => {
  const trigger = [...document.querySelectorAll<HTMLElement>("[data-v4-button]")].find(
    (node) => node.textContent?.trim() === "More"
  );
  if (!trigger) throw new Error("Missing More trigger");
  await React.act(async () => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  return [
    ...element("[data-slot=dropdown-menu-content]").querySelectorAll<HTMLElement>(
      "[data-slot=dropdown-menu-item], [data-slot=dropdown-menu-separator]"
    )
  ];
};
const label = (node: HTMLElement) =>
  node.dataset.slot === "dropdown-menu-separator" ? "---" : node.textContent?.trim();

it("shows one primary action and moves the rest into the More menu", async () => {
  await render("active");
  const primary = document.querySelectorAll("[data-v4-button][data-variant=primary]");
  expect(primary).toHaveLength(1);
  expect(primary[0].textContent).toContain("Download");
  expect(document.querySelectorAll("[data-v4-button]")).toHaveLength(2);
});

it("separates Revoke from Renew and confirms through onRevoke", async () => {
  const onRevoke = await render("active");
  const rows = await openMore();
  expect(rows.map(label)).toEqual([
    "Renew now",
    "Manage auto renewal",
    "Manage certificate syncs",
    "Assign to application",
    "---",
    "Revoke certificate",
    expect.stringContaining("Delete certificate")
  ]);
  const revoke = rows[5];
  expect(revoke.dataset.variant).toBe("destructive");
  expect(revoke.hasAttribute("data-disabled")).toBe(false);
  await React.act(async () => revoke.click());
  expect(onRevoke).toHaveBeenCalledTimes(1);
});

it("keeps blocked actions visible with the reason", async () => {
  const onRevoke = await render("expired");
  const rows = await openMore();
  const row = (text: string) => rows.find((node) => node.textContent?.startsWith(text))!;
  expect(row("Renew now").hasAttribute("data-disabled")).toBe(true);
  expect(row("Renew now").textContent).toContain("Only active certificates renew");
  expect(row("Manage certificate syncs").textContent).toContain("Only active certificates sync");
  const revoke = row("Revoke certificate");
  expect(revoke.hasAttribute("data-disabled")).toBe(true);
  expect(revoke.textContent).toContain("Expired certificates need no revocation");
  await React.act(async () => revoke.click());
  expect(onRevoke).not.toHaveBeenCalled();
  expect(row("Delete certificate").hasAttribute("data-disabled")).toBe(false);
});

it("asks for confirmation from Delete certificate once it is allowed", async () => {
  const onDelete = vi.fn();
  await render("active", vi.fn(), onDelete);
  let rows = await openMore();
  const active = rows.find((node) => node.textContent?.startsWith("Delete certificate"))!;
  await React.act(async () => active.click());
  expect(onDelete).not.toHaveBeenCalled();
  await React.act(async () => root.render(<V4Scope />));
  await render("expired", vi.fn(), onDelete);
  rows = await openMore();
  const expired = rows.find((node) => node.textContent?.startsWith("Delete certificate"))!;
  expect(expired.dataset.variant).toBe("destructive");
  await React.act(async () => expired.click());
  expect(onDelete).toHaveBeenCalledTimes(1);
});

it("deletes only after the confirmation key is typed, as main does", async () => {
  const onDelete = vi.fn();
  await React.act(async () =>
    root.render(
      <V4Scope>
        <DeleteCertificateDialog open onOpenChange={vi.fn()} onDelete={onDelete} />
      </V4Scope>
    )
  );
  const dialog = element("[role=alertdialog]");
  expect(dialog.textContent).toContain("Are you sure you want to delete this certificate?");
  expect(dialog.textContent).toContain(
    "This action cannot be undone. The certificate will be permanently deleted."
  );
  const action = element("[data-slot=alert-dialog-action]") as HTMLButtonElement;
  expect(action.textContent?.trim()).toBe("Delete");
  expect(action.closest("[data-v4-button]")?.getAttribute("data-variant")).toBe("destructive");
  expect(action.disabled).toBe(true);
  const input = element("[data-slot=alert-dialog-confirm] input") as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await React.act(async () => {
    setValue.call(input, "confirm");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(action.disabled).toBe(false);
  await React.act(async () => action.click());
  expect(onDelete).toHaveBeenCalledTimes(1);
});
