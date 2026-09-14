import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";

import { getProviderIconPath, PROVIDER_ICON_VARIANTS } from "./provider-icon-assets";

describe("provider icon assets", () => {
  it("uses the default asset when no light mode counterpart is registered", () => {
    assert.equal(
      getProviderIconPath("Amazon Web Services.png", "light"),
      "/images/integrations/Amazon Web Services.png"
    );
  });

  it("uses a registered light mode counterpart", () => {
    assert.equal(
      getProviderIconPath("DatadogWhite.png", "light"),
      "/images/integrations/Datadog.png"
    );
  });

  it("keeps the default asset in dark mode", () => {
    assert.equal(
      getProviderIconPath("DatadogWhite.png", "dark"),
      "/images/integrations/DatadogWhite.png"
    );
  });

  it("references assets that exist", () => {
    Object.entries(PROVIDER_ICON_VARIANTS).forEach(([icon, { onLight }]) => {
      [icon, onLight].forEach((fileName) => {
        assert.ok(
          fileName &&
            existsSync(
              new URL(`../../../../../public/images/integrations/${fileName}`, import.meta.url)
            ),
          fileName
        );
      });
    });
  });
});
