import { describe, expect, it } from "vitest";

import { getProviderIconPath } from "./provider-icon-assets";

describe("getProviderIconPath", () => {
  it.each(["OpenAI.png", "OpenAIWhite.png"])("resolves %s for both themes", (icon) => {
    expect(getProviderIconPath(icon, "dark")).toBe("/images/integrations/OpenAIWhite.png");
    expect(getProviderIconPath(icon, "light")).toBe("/images/integrations/OpenAI.png");
  });

  it("uses the transparent Anthropic mark only in dark mode", () => {
    expect(getProviderIconPath("Anthropic.png", "dark")).toBe(
      "/images/integrations/Anthropic.on-dark.svg"
    );
    expect(getProviderIconPath("Anthropic.png", "light")).toBe(
      "/images/integrations/Anthropic.png"
    );
  });

  it("preserves icons without theme variants", () => {
    expect(getProviderIconPath("Gemini.svg", "dark")).toBe("/images/integrations/Gemini.svg");
    expect(getProviderIconPath("Gemini.svg", "light")).toBe("/images/integrations/Gemini.svg");
  });
});
