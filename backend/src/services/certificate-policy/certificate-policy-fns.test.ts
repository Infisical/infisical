import { describe, expect, it } from "vitest";

import { CertSubjectAttributeType } from "../certificate-common/certificate-constants";
import { normalizeSubjectRules, validateDomainComponentsAgainstRule } from "./certificate-policy-fns";
import { TDomainComponentSubjectRule } from "./certificate-policy-types";

const domainComponentRule = (rule: Omit<TDomainComponentSubjectRule, "type">): TDomainComponentSubjectRule => ({
  type: CertSubjectAttributeType.DOMAIN_COMPONENT,
  ...rule
});

describe("normalizeSubjectRules", () => {
  it("should lift a legacy flat label list into one ordered sequence", () => {
    expect(normalizeSubjectRules([{ type: "domain_component", allowed: ["corp", "example", "com"] }])).toEqual([
      { type: "domain_component", allowed: [["corp", "example", "com"]], required: undefined, denied: undefined }
    ]);
  });

  it("should leave sequences that are already nested alone", () => {
    const sequences = [
      ["corp", "example", "com"],
      ["example", "com"]
    ];
    expect(normalizeSubjectRules([{ type: "domain_component", denied: sequences }])).toEqual([
      { type: "domain_component", allowed: undefined, required: undefined, denied: sequences }
    ]);
  });

  it("should leave the rules of other attribute types untouched", () => {
    const rules = [{ type: "common_name", allowed: ["*.example.com"] }];
    expect(normalizeSubjectRules(rules)).toEqual(rules);
  });

  it("should keep an empty list empty rather than reading it as a sequence", () => {
    expect(normalizeSubjectRules([{ type: "domain_component", allowed: [] }])).toEqual([
      { type: "domain_component", allowed: [], required: undefined, denied: undefined }
    ]);
  });

  it("should return a value it cannot read unchanged rather than dropping the constraint", () => {
    expect(normalizeSubjectRules(null)).toBeNull();
    expect(normalizeSubjectRules("domain_component")).toBe("domain_component");
  });
});

describe("validateDomainComponentsAgainstRule", () => {
  const validate = (requestDomainComponents: string[], rule: TDomainComponentSubjectRule, skipRequired = false) =>
    validateDomainComponentsAgainstRule({ requestDomainComponents, rule, skipRequired });

  it("should accept a request matching an allowed sequence", () => {
    expect(
      validate(["corp", "example", "com"], domainComponentRule({ allowed: [["corp", "example", "com"]] }))
    ).toEqual([]);
  });

  it("should reject the same labels in another order", () => {
    expect(
      validate(["com", "example", "corp"], domainComponentRule({ allowed: [["corp", "example", "com"]] }))
    ).toHaveLength(1);
  });

  it("should match a wildcard only at its own position", () => {
    const rule = domainComponentRule({ allowed: [["*", "example", "com"]] });
    expect(validate(["corp", "example", "com"], rule)).toEqual([]);
    expect(validate(["example", "com", "corp"], rule)).toHaveLength(1);
  });

  it("should reject a sequence of a different length", () => {
    expect(validate(["corp", "example", "com"], domainComponentRule({ allowed: [["example", "com"]] }))).toHaveLength(
      1
    );
  });

  it("should compare components case-insensitively", () => {
    expect(
      validate(["Corp", "EXAMPLE", "com"], domainComponentRule({ allowed: [["corp", "example", "com"]] }))
    ).toEqual([]);
  });

  it("should report a request that has no domain components as missing when a sequence is required", () => {
    const errors = validate([], domainComponentRule({ required: [["corp", "example", "com"]] }));
    expect(errors).toEqual([
      "Missing required domain_component attribute. This policy requires one of: 'DC=corp,DC=example,DC=com'"
    ]);
  });

  it("should skip the required check when the caller asks for it", () => {
    expect(validate([], domainComponentRule({ required: [["corp", "example", "com"]] }), true)).toEqual([]);
  });

  it("should accept a required sequence without it also having to be in the allowed list", () => {
    const rule = domainComponentRule({ allowed: [["example", "com"]], required: [["corp", "example", "com"]] });
    expect(validate(["corp", "example", "com"], rule)).toEqual([]);
  });

  it("should reject a denied sequence and report it once", () => {
    const errors = validate(["evil", "example", "com"], domainComponentRule({ denied: [["evil", "example", "com"]] }));
    expect(errors).toEqual(["Domain components 'DC=evil,DC=example,DC=com' are denied by template policy"]);
  });

  it("should treat a rule with no populated list as no constraint", () => {
    expect(validate(["corp", "example", "com"], domainComponentRule({ allowed: [] }))).toEqual([]);
  });

  it("should point at the encoding order when the same components would match reversed", () => {
    const errors = validate(["com", "example", "corp"], domainComponentRule({ allowed: [["corp", "example", "com"]] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      "The same components in the opposite order would match, so check which end the client encoded first."
    );
  });

  it("should not mention the opposite order when reversing would not help either", () => {
    const errors = validate(["a", "b", "c"], domainComponentRule({ allowed: [["corp", "example", "com"]] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain("opposite order");
  });

  it("should not mention the opposite order for a single component, which reads the same either way", () => {
    const errors = validate(["corp"], domainComponentRule({ allowed: [["example"]] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain("opposite order");
  });

  it("should point at the encoding order on a required mismatch too", () => {
    const errors = validate(
      ["com", "example", "corp"],
      domainComponentRule({ required: [["corp", "example", "com"]] })
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("opposite order");
  });

  it("should refuse a rule whose value list cannot be read instead of treating it as no constraint", () => {
    const malformedRule = {
      type: CertSubjectAttributeType.DOMAIN_COMPONENT,
      allowed: "corp,example,com"
    } as unknown as TDomainComponentSubjectRule;

    expect(validate(["anything"], malformedRule)).toEqual([
      "The domain_component rule on this policy is malformed and cannot be evaluated. Edit the policy's domain component rule before issuing against it."
    ]);
  });

  it("should read a legacy flat label list as one ordered sequence", () => {
    const legacyRule = {
      type: CertSubjectAttributeType.DOMAIN_COMPONENT,
      allowed: ["corp", "example", "com"]
    } as unknown as TDomainComponentSubjectRule;

    expect(validate(["corp", "example", "com"], legacyRule)).toEqual([]);
    expect(validate(["com", "example", "corp"], legacyRule)).toHaveLength(1);
  });
});
