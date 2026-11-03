// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { Breadcrumb } from "./breadcrumb";

it("navigates from a switcher crumb's name without opening its switcher", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onNavigate = vi.fn();
  const onOpenChange = vi.fn();
  act(() =>
    root.render(
      <Breadcrumb
        items={[
          {
            label: "payments-api",
            onNavigate,
            switcher: { label: "Switch project", options: [], onOpenChange }
          },
          { label: "Secrets" }
        ]}
      />
    )
  );
  act(() => host.querySelector<HTMLElement>('[data-slot="breadcrumb-name"]')?.click());
  expect(onNavigate).toHaveBeenCalledOnce();
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(
    host.querySelector('[data-slot="breadcrumb-switcher"]')?.getAttribute("aria-expanded")
  ).toBe("false");
  act(() => root.unmount());
  host.remove();
});
