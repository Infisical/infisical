// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "./card";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
});

const Parts = () => (
  <>
    <CardHeader>
      <CardTitle>Payments environment defaults</CardTitle>
      <CardDescription>Inherited by new connections.</CardDescription>
      <CardAction>
        <button type="button">Edit defaults</button>
      </CardAction>
    </CardHeader>
    <CardContent>Staging</CardContent>
    <CardFooter>Updated today</CardFooter>
  </>
);

it("keeps explicit parts from fragments and component wrappers out of a second content slot", async () => {
  await React.act(async () =>
    root.render(
      <Card size="sm" variant="plain">
        <Parts />
      </Card>
    )
  );
  const content = host.querySelectorAll('[data-slot="card-content"]');
  expect(content).toHaveLength(1);
  expect(content[0].textContent).toBe("Staging");
  expect(content[0].parentElement).toBe(host.querySelector('[data-slot="card"]'));
  expect(
    host.querySelector('[data-slot="card-header"]')?.closest('[data-slot="card-content"]')
  ).toBeNull();
  expect(
    host.querySelector('[data-slot="card-footer"]')?.closest('[data-slot="card-content"]')
  ).toBeNull();
  expect(host.querySelector("button")?.textContent).toBe("Edit defaults");
});

it("preserves arbitrary convenience children and their draft state through surface and size changes", async () => {
  const Draft = () => {
    const [count, setCount] = React.useState(0);
    return (
      <button type="button" onClick={() => setCount(count + 1)}>
        Draft {count}
      </button>
    );
  };
  const render = (variant: "plain" | "framed", size: "default" | "sm") =>
    React.act(async () =>
      root.render(
        <Card title="Environment defaults" variant={variant} size={size} footer="Updated today">
          <div>
            <Draft />
          </div>
        </Card>
      )
    );
  await render("framed", "default");
  await React.act(async () => host.querySelector("button")?.click());
  await render("plain", "sm");
  expect(host.querySelector("button")?.textContent).toBe("Draft 1");
  expect(host.querySelectorAll('[data-slot="card-content"]')).toHaveLength(1);
  expect(host.querySelector('[data-slot="card-title"]')?.textContent).toBe("Environment defaults");
});
