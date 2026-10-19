import { describe, expect, it } from "vitest";

import { componentCatalog } from "@app/components/v4/catalog";
import required from "@app/components/v4/required-capabilities.json";
import guidance from "@app/components/v4/skills/infisical-ui/rules.json";

import {
  resolveColorToken,
  resolveSpacingToken,
  tokens,
  typeSpecimenStyle
} from "./foundation-data";
import {
  componentPages,
  documentationPages,
  hasComponentPreview,
  resolveDocumentationPage
} from "./navigation";

describe("design-system documentation", () => {
  it("resolves supported pages and canonical rule links without inventing component previews", () => {
    expect(resolveDocumentationPage("#colors")).toBe("colors");
    expect(resolveDocumentationPage("#typography")).toBe("typography");
    expect(resolveDocumentationPage("#spacing-shape")).toBe("spacing-shape");
    expect(resolveDocumentationPage("#rule-keyboard-path")).toBe("rules");
    expect(resolveDocumentationPage("#rule-keyboard")).toBe("overview");
    expect(resolveDocumentationPage("#rule-button-usage")).toBe("button");
    expect(resolveDocumentationPage("#button")).toBe("button");
    expect(resolveDocumentationPage("#button-directions")).toBe("button");
    expect(documentationPages.some((page) => page.id === "button-directions")).toBe(false);
    expect(resolveDocumentationPage("#chart")).toBe("chart");
    expect(resolveDocumentationPage("#command")).toBe("command-menu");
    expect(resolveDocumentationPage("#empty")).toBe("empty-state");
    expect(resolveDocumentationPage("#sonner")).toBe("toast");
    expect(resolveDocumentationPage("#unknown")).toBe("overview");
    expect(hasComponentPreview("chart")).toBe(true);
    expect(hasComponentPreview("missing-component")).toBe(false);
    componentPages.forEach((page) => {
      expect(
        componentCatalog.some((entry) => entry.id === page.id && entry.examples.length > 0)
      ).toBe(true);
    });
    required.components.forEach((entry) => expect(hasComponentPreview(entry.id)).toBe(true));
    expect(new Set(documentationPages.map((page) => page.id)).size).toBe(documentationPages.length);
    expect(new Set(guidance.rules.map((rule) => rule.id)).size).toBe(guidance.rules.length);
  });

  it("resolves theme-specific aliases from the source token catalog", () => {
    const tint = tokens.color.tokens.find((token) => token.name === "tint");
    const frame = tokens.color.tokens.find((token) => token.name === "frame");
    const ink = tokens.color.tokens.find((token) => token.name === "ink");
    const accent = tokens.color.tokens.find((token) => token.name === "accent");
    expect(resolveColorToken("sidebar", "light")).toBe(tint?.value.light);
    expect(resolveColorToken("sidebar", "dark")).toBe(frame?.value.dark);
    expect(resolveColorToken("accent-fg", "light")).toBe(ink?.value.light);
    expect(resolveColorToken("accent-fg", "dark")).toBe(accent?.value.dark);
    expect(() => resolveColorToken("missing-role", "light")).toThrow("Unknown color token");
  });

  it("uses the source typography values and intended font family for specimens", () => {
    const display = tokens.type.groups
      .flatMap((group) => group.styles)
      .find((style) => style.name === "display");
    expect(typeSpecimenStyle("display")).toMatchObject({
      fontFamily: tokens.type.families.sans,
      fontSize: display?.fontSize,
      lineHeight: display?.lineHeight,
      fontWeight: display?.fontWeight
    });
    expect(typeSpecimenStyle("mono").fontFamily).toBe(tokens.type.families.mono);
    expect(() => typeSpecimenStyle("missing-role")).toThrow("Unknown typography role");
  });

  it("resolves spacing aliases to CSS lengths without changing their source labels", () => {
    expect(resolveSpacingToken("space-control-inline-sm")).toBe("10px");
    expect(resolveSpacingToken("space-control-inline")).toBe("14px");
    expect(resolveSpacingToken("space-field-label")).toBe("6px");
    expect(resolveSpacingToken("space-content-section")).toBe("32px");
    tokens.spacing.tokens.forEach((token) => {
      expect(resolveSpacingToken(token.name)).toMatch(/^\d+px$/);
      if (!token.value.startsWith("{")) expect(resolveSpacingToken(token.name)).toBe(token.value);
    });
    expect(
      tokens.spacing.tokens.find((token) => token.name === "space-control-inline-sm")?.value
    ).toBe("{space-10}");
    expect(() => resolveSpacingToken("missing-role")).toThrow("Unknown spacing token");
  });
});
