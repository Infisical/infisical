import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";

import { HIDDEN_SECRET_VALUE } from "@app/const/secrets";

import { SecretInput } from "./SecretInput";

// The @app/hooks barrel pulls in the router and API client, which cannot load outside the app.
vi.mock("@app/hooks", async () => import("@app/hooks/useToggle"));

describe("SecretInput hidden values", () => {
  it("renders the fixed mask and never the raw value while hidden", () => {
    const markup = renderToStaticMarkup(<SecretInput value="hunter2" isVisible={false} readOnly />);
    assert.ok(markup.includes(HIDDEN_SECRET_VALUE));
    assert.ok(!markup.includes("hunter2"));
  });

  it("shows one dot per character when masking each character", () => {
    const markup = renderToStaticMarkup(
      <SecretInput value={"ab\ncd"} valueAlwaysHidden maskEachCharacter readOnly />
    );
    assert.ok(markup.includes("••\n••"));
  });
});
