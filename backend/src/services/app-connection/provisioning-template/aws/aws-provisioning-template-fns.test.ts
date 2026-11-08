import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AWS_PROVISIONING_TEMPLATE_VERSION } from "./aws-provisioning-template-constants";

describe("AWS provisioning template version", () => {
  it("matches the template generator", () => {
    const generator = readFileSync(
      path.resolve(__dirname, "../../../../../../cloudformation/aws-app-connection/generate-template.mjs"),
      "utf8"
    );

    expect(generator).toContain(`export const TEMPLATE_VERSION = "${AWS_PROVISIONING_TEMPLATE_VERSION}";`);
  });

  it("matches the committed template", () => {
    const template = readFileSync(
      path.resolve(__dirname, "../../../../../../cloudformation/aws-app-connection/infisical-aws-app-connection.yaml"),
      "utf8"
    );

    expect(template).toContain(`InfisicalTemplateVersion: "${AWS_PROVISIONING_TEMPLATE_VERSION}"`);
  });
});
