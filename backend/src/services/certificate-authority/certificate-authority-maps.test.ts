import { describe, expect, it } from "vitest";

import { CaType } from "./certificate-authority-enums";
import { caIssuesFromCsr } from "./certificate-authority-maps";

describe("caIssuesFromCsr", () => {
  it.each(Object.values(CaType))("decides whether %s issues from a CSR", (caType) => {
    expect(caIssuesFromCsr(caType)).toBe(caType !== CaType.AWS_ACM_PUBLIC_CA);
  });
});
