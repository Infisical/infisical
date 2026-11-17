// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, ReactElement, ReactNode } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

import { RequestedSecretsTable } from "./RequestSecret/RequestedSecretsTable";
import { ShareSecretsTable } from "./ShareSecret/ShareSecretsTable";

const queries = vi.hoisted(() => ({ shared: vi.fn(), requested: vi.fn() }));

vi.mock("@app/hooks/api/secretSharing", () => ({
  useGetSharedSecrets: queries.shared,
  useGetSecretRequests: queries.requested
}));

vi.mock("@app/components/v3", async () => {
  const { Pagination } = await import("@app/components/v3/generic/Pagination");
  const wrapper = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    Pagination,
    Empty: wrapper,
    EmptyDescription: wrapper,
    EmptyHeader: wrapper,
    EmptyTitle: wrapper,
    Skeleton: () => <span>Loading</span>,
    Table: ({ children }: { children: ReactNode }) => <table>{children}</table>,
    TableBody: ({ children }: { children: ReactNode }) => <tbody>{children}</tbody>,
    TableCell: ({ children }: { children: ReactNode }) => <td>{children}</td>,
    TableHead: ({ children }: { children: ReactNode }) => <th>{children}</th>,
    TableHeader: ({ children }: { children: ReactNode }) => <thead>{children}</thead>,
    TableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>
  };
});

vi.mock("./ShareSecret/ShareSecretsRow", () => ({
  ShareSecretsRow: ({ row }: { row: { id: string } }) => (
    <tr>
      <td>{row.id}</td>
    </tr>
  )
}));
vi.mock("./RequestSecret/RequestedSecretsRow", () => ({
  RequestedSecretsRow: ({ row }: { row: { id: string } }) => (
    <tr>
      <td>{row.id}</td>
    </tr>
  )
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const render = async (element: ReactElement) => {
  await act(() => root.render(element));
};

const nextPage = async () => {
  const button = container.querySelector<HTMLButtonElement>('[aria-label="Go to next page"]');
  assert.ok(button);
  await act(() => button.click());
};

describe.each([
  ["shared secrets", ShareSecretsTable, queries.shared, "Could Not Load Shared Secrets"],
  ["secret requests", RequestedSecretsTable, queries.requested, "Could Not Load Secret Requests"]
] as const)("%s pagination", (_name, Component, query, errorTitle) => {
  it("returns to the remaining rows when the last row on the last page is deleted", async () => {
    let totalCount = 11;
    query.mockImplementation(({ offset, limit }: { offset: number; limit: number }) => ({
      isPending: false,
      isError: false,
      data: {
        totalCount,
        secrets: Array.from(
          { length: Math.max(0, Math.min(limit, totalCount - offset)) },
          (_, i) => ({
            id: `secret-${offset + i}`
          })
        )
      }
    }));
    await render(<Component handlePopUpOpen={vi.fn()} />);
    await nextPage();
    assert.deepEqual(query.mock.lastCall?.[0], { offset: 10, limit: 10 });
    assert.ok(container.textContent?.includes("secret-10"));

    totalCount = 10;
    await render(<Component handlePopUpOpen={vi.fn()} />);
    assert.deepEqual(query.mock.lastCall?.[0], { offset: 0, limit: 10 });
    assert.ok(container.textContent?.includes("secret-0"));
    assert.ok(container.textContent?.includes("secret-9"));
  });

  it.each([
    { isPending: true, isError: false },
    { isPending: false, isError: true }
  ])("keeps the selected page when its response is unavailable: %j", async (status) => {
    query.mockReturnValue({
      isPending: false,
      isError: false,
      data: { totalCount: 21, secrets: [{ id: "secret-1" }] }
    });
    await render(<Component handlePopUpOpen={vi.fn()} />);
    query.mockReturnValue({ ...status, data: undefined });
    await nextPage();
    assert.deepEqual(query.mock.lastCall?.[0], { offset: 10, limit: 10 });
    if (status.isError) assert.ok(container.textContent?.includes(errorTitle));
    else assert.ok(container.textContent?.includes("Loading"));
  });
});
