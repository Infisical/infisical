import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// eslint-disable-next-line import/extensions
import { buildPolicyStatements } from "../../scripts/generate-aws-use-case-policies.mjs";
import { AWS_USE_CASE_POLICY_STATEMENTS } from "./awsUseCasePolicies";
import { AWS_USE_CASE_GROUPS, getAwsUpdateStackHint } from "./awsUseCases";

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

describe("getAwsUpdateStackHint", () => {
  test("shows for a Stack-managed connection that lacks a needed use case when the user can edit it", () => {
    expect(
      getAwsUpdateStackHint({
        recordedUseCases: ["secrets-manager"],
        neededUseCases: ["parameter-store"],
        canEdit: true
      })
    ).toEqual({ show: true, missingUseCases: ["parameter-store"] });
  });

  test("does not show when every needed use case is already recorded", () => {
    expect(
      getAwsUpdateStackHint({
        recordedUseCases: ["secrets-manager", "parameter-store"],
        neededUseCases: ["parameter-store"],
        canEdit: true
      })
    ).toEqual({ show: false, missingUseCases: [] });
  });

  test("does not show without edit permission", () => {
    expect(
      getAwsUpdateStackHint({
        recordedUseCases: ["secrets-manager"],
        neededUseCases: ["parameter-store"],
        canEdit: false
      }).show
    ).toBe(false);
  });

  test.each([null, undefined])(
    "does not show for a connection with no recorded use cases (%s)",
    (recordedUseCases) => {
      expect(
        getAwsUpdateStackHint({
          recordedUseCases,
          neededUseCases: ["parameter-store"],
          canEdit: true
        })
      ).toEqual({ show: false, missingUseCases: [] });
    }
  );

  test("reports exactly the missing use cases when a feature needs several", () => {
    expect(
      getAwsUpdateStackHint({
        recordedUseCases: ["acm-sync"],
        neededUseCases: ["acm-sync", "elb-sync", "private-ca"],
        canEdit: true
      })
    ).toEqual({ show: true, missingUseCases: ["elb-sync", "private-ca"] });
  });
});
