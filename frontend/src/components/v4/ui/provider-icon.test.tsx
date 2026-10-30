// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

import { V4Scope } from "../scope";
import { ProviderIcon } from "./provider-icon";

it("resolves the theme counterpart of a provider logo", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await React.act(async () =>
    root.render(
      <V4Scope theme="light">
        <ProviderIcon icon="GitHub.png" alt="GitHub logo" />
      </V4Scope>
    )
  );
  expect(host.querySelector("img")?.getAttribute("src")).toBe(
    "/images/integrations/GitHub.on-light.png"
  );
  await React.act(async () => root.unmount());
  host.remove();
});
