import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// eslint-disable-next-line import/extensions
import { buildPolicyStatements } from "../../scripts/generate-aws-use-case-policies.mjs";
import { AWS_USE_CASE_POLICY_STATEMENTS } from "./awsUseCasePolicies";
import { AWS_USE_CASE_GROUPS } from "./awsUseCases";

const template = readFileSync(
  path.resolve(
    __dirname,
    "../../../cloudformation/aws-app-connection/infisical-aws-app-connection.yaml"
  ),
  "utf8"
);

const toParameterName = (id: string) =>
  `Enable${id
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("")}`;

describe("AWS use cases", () => {
  test("generated policies match use-cases.jsx (run npm run generate:aws-policies)", () => {
    expect(AWS_USE_CASE_POLICY_STATEMENTS).toEqual(buildPolicyStatements());
  });

  test.each(AWS_USE_CASE_GROUPS.flatMap((group) => group.options.map((option) => option.id)))(
    "%s has an Enable parameter in the provisioning template",
    (id) => {
      expect(template).toMatch(new RegExp(`^ {2}${toParameterName(id)}:`, "m"));
    }
  );
});
