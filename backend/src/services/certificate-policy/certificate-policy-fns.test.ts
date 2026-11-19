import { describe, expect, it } from "vitest";

import { CertSubjectAttributeType } from "../certificate-common/certificate-constants";
import { validateDomainComponentsAgainstRule } from "./certificate-policy-fns";
import { TSubjectRule } from "./certificate-policy-types";

const domainComponentRule = (rule: Omit<TSubjectRule, "type">): TSubjectRule => ({
  type: CertSubjectAttributeType.DOMAIN_COMPONENT,
  ...rule
});

describe("validateDomainComponentsAgainstRule", () => {
  const validate = (requestDomainComponents: string[], rule: TSubjectRule, skipRequired = false) =>
    validateDomainComponentsAgainstRule({ requestDomainComponents, rule, skipRequired });

  it("should accept a request matching an allowed sequence", () => {
    expect(validate(["corp", "example", "com"], domainComponentRule({ allowed: ["corp,example,com"] }))).toEqual([]);
  });

  it("should reject the same labels in another order", () => {
    expect(validate(["com", "example", "corp"], domainComponentRule({ allowed: ["corp,example,com"] }))).toHaveLength(
      1
    );
  });

  it("should match a wildcard only at its own position", () => {
    const rule = domainComponentRule({ allowed: ["*,example,com"] });
    expect(validate(["corp", "example", "com"], rule)).toEqual([]);
    expect(validate(["example", "com", "corp"], rule)).toHaveLength(1);
  });

  it("should reject a sequence of a different length", () => {
    expect(validate(["corp", "example", "com"], domainComponentRule({ allowed: ["example,com"] }))).toHaveLength(1);
  });

  it("should compare components case-insensitively", () => {
    expect(validate(["Corp", "EXAMPLE", "com"], domainComponentRule({ allowed: ["corp,example,com"] }))).toEqual([]);
  });

  it("should report a request that has no domain components as missing when a sequence is required", () => {
    const errors = validate([], domainComponentRule({ required: ["corp,example,com"] }));
    expect(errors).toEqual([
      "Missing required domain_component attribute. This policy requires one of: 'DC=corp,DC=example,DC=com'"
    ]);
  });

  it("should skip the required check when the caller asks for it", () => {
    expect(validate([], domainComponentRule({ required: ["corp,example,com"] }), true)).toEqual([]);
  });

  it("should accept a required sequence without it also having to be in the allowed list", () => {
    const rule = domainComponentRule({ allowed: ["example,com"], required: ["corp,example,com"] });
    expect(validate(["corp", "example", "com"], rule)).toEqual([]);
  });

  it("should reject a denied sequence and report it once", () => {
    const errors = validate(["evil", "example", "com"], domainComponentRule({ denied: ["evil,example,com"] }));
    expect(errors).toEqual([
      "Domain components 'DC=evil,DC=example,DC=com' are denied by this policy. Denied sequences: 'DC=evil,DC=example,DC=com'"
    ]);
  });

  it("should deny everything under a denied sequence", () => {
    const rule = domainComponentRule({ denied: ["corp,example,com"] });
    expect(validate(["dev", "corp", "example", "com"], rule)).toHaveLength(1);
    expect(validate(["other", "example", "com"], rule)).toEqual([]);
    expect(validate(["example", "com"], rule)).toEqual([]);
  });

  it("should deny a label wherever it appears in the chain", () => {
    const rule = domainComponentRule({ denied: ["evil"] });
    expect(validate(["evil"], rule)).toHaveLength(1);
    expect(validate(["evil", "example"], rule)).toHaveLength(1);
    expect(validate(["a", "evil", "b"], rule)).toHaveLength(1);
    expect(validate(["good", "example"], rule)).toEqual([]);
  });

  it("should keep each label of a legacy flat deny list denied on its own", () => {
    const legacyRule = {
      type: CertSubjectAttributeType.DOMAIN_COMPONENT,
      denied: ["evil", "bad"]
    } as unknown as TSubjectRule;

    expect(validate(["evil"], legacyRule)).toHaveLength(1);
    expect(validate(["bad", "example"], legacyRule)).toHaveLength(1);
    expect(validate(["ok", "example"], legacyRule)).toEqual([]);
  });

  it("should deny one subtree while still allowing its siblings", () => {
    const rule = domainComponentRule({
      allowed: ["*,example,com"],
      denied: ["dev,example,com"]
    });
    expect(validate(["prod", "example", "com"], rule)).toEqual([]);
    expect(validate(["dev", "example", "com"], rule)).toHaveLength(1);
  });

  it("should honour a wildcard inside a denied sequence", () => {
    const rule = domainComponentRule({ denied: ["*,internal,com"] });
    expect(validate(["a", "internal", "com"], rule)).toHaveLength(1);
    expect(validate(["internal", "com"], rule)).toEqual([]);
  });

  it("should treat a rule with no populated list as no constraint", () => {
    expect(validate(["corp", "example", "com"], domainComponentRule({ allowed: [] }))).toEqual([]);
  });

  it("should point at the encoding order when the same components would match reversed", () => {
    const errors = validate(["com", "example", "corp"], domainComponentRule({ allowed: ["corp,example,com"] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      "The same components in the opposite order would match, so check which end the client encoded first."
    );
  });

  it("should not mention the opposite order when reversing would not help either", () => {
    const errors = validate(["a", "b", "c"], domainComponentRule({ allowed: ["corp,example,com"] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain("opposite order");
  });

  it("should not mention the opposite order for a single component, which reads the same either way", () => {
    const errors = validate(["corp"], domainComponentRule({ allowed: ["example"] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain("opposite order");
  });

  it("should point at the encoding order on a required mismatch too", () => {
    const errors = validate(["com", "example", "corp"], domainComponentRule({ required: ["corp,example,com"] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("opposite order");
  });

  it("should refuse a sequence holding an empty component instead of reading it as a shorter chain", () => {
    const malformedRule = {
      type: CertSubjectAttributeType.DOMAIN_COMPONENT,
      allowed: ["corp,,com"]
    } as unknown as TSubjectRule;

    expect(validate(["corp", "com"], malformedRule)).toHaveLength(1);
  });

  it("should refuse a rule whose values are all blank instead of allowing everything", () => {
    expect(validate(["anything"], domainComponentRule({ allowed: ["   "] }))).toHaveLength(1);
  });

  it("should refuse a rule whose value list cannot be read instead of treating it as no constraint", () => {
    const malformedRule = {
      type: CertSubjectAttributeType.DOMAIN_COMPONENT,
      allowed: "corp,example,com"
    } as unknown as TSubjectRule;

    expect(validate(["anything"], malformedRule)).toEqual([
      "The domain_component rule on this policy is malformed and cannot be evaluated. Edit the policy's domain component rule before issuing against it."
    ]);
  });

  it("should read each entry as its own sequence", () => {
    const rule = domainComponentRule({ allowed: ["corp,example,com", "example,com"] });

    expect(validate(["corp", "example", "com"], rule)).toEqual([]);
    expect(validate(["example", "com"], rule)).toEqual([]);
    expect(validate(["com"], rule)).toHaveLength(1);
  });

  it("should tolerate spacing around the components of a stored sequence", () => {
    expect(validate(["corp", "example", "com"], domainComponentRule({ allowed: [" corp , example , com "] }))).toEqual(
      []
    );
  });
});
