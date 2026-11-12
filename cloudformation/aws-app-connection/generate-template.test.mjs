import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { awsUseCaseGroups, buildTemplate, renderTemplate, TEMPLATE_PATH } from "./generate-template.mjs";

const template = buildTemplate();
const useCases = awsUseCaseGroups.flatMap((group) => group.options).filter((option) => option.policy);

test("committed template matches generated output", () => {
  assert.equal(readFileSync(TEMPLATE_PATH, "utf8"), renderTemplate());
});

test("role is assume-role only", () => {
  const types = Object.values(template.Resources).map((resource) => resource.Type);
  assert.ok(types.includes("AWS::IAM::Role"));
  assert.ok(!types.includes("AWS::IAM::User"));
  assert.ok(!types.includes("AWS::IAM::AccessKey"));
});

test("exposes core parameters and a RoleArn output", () => {
  for (const name of ["ExternalId", "TrustedAccountId", "RoleName"]) assert.ok(template.Parameters[name], name);
  assert.ok(template.Outputs.RoleArn);
});

test("every use case has a toggle and a conditional policy", () => {
  for (const useCase of useCases) {
    const toggle = template.Parameters[`Enable${useCase.id.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())}`];
    assert.deepEqual(toggle?.AllowedValues, ["true", "false"], useCase.id);
  }
  const policies = Object.values(template.Resources).filter((resource) => resource.Type === "AWS::IAM::RolePolicy");
  assert.ok(policies.length >= useCases.length);
  assert.ok(policies.every((policy) => policy.Condition));
});

test("all ARNs use the partition pseudo-parameter", () => {
  const rendered = renderTemplate();
  assert.ok(!/arn:aws[:"]/.test(rendered));
  assert.ok(rendered.includes("${AWS::Partition}"));
});

test("resource parameters are required only when a toggle is on", () => {
  const rule = template.Rules.RequirePamRecordingBucket;
  assert.ok(rule.RuleCondition);
  assert.deepEqual(rule.Assertions[0].Assert, { "Fn::Not": [{ "Fn::Equals": [{ Ref: "PamRecordingBucket" }, ""] }] });
  assert.equal(template.Parameters.PamRecordingBucket.Default, "");
});

test("the session logs key prefix is optional and an empty one leaves no stray slash", () => {
  assert.ok(!template.Rules.RequireAgentVaultSessionLogsKeyPrefix);
  assert.ok(template.Rules.RequireAgentVaultSessionLogsBucket);
  assert.deepEqual(template.Conditions.HasAgentVaultSessionLogsKeyPrefix, {
    "Fn::Not": [{ "Fn::Equals": [{ Ref: "AgentVaultSessionLogsKeyPrefix" }, ""] }]
  });

  const [objects, bucket] = template.Resources.AgentVaultSessionLogsPolicy.Properties.PolicyDocument.Statement;
  assert.deepEqual(objects.Resource, {
    "Fn::If": [
      "HasAgentVaultSessionLogsKeyPrefix",
      { "Fn::Sub": "arn:${AWS::Partition}:s3:::${AgentVaultSessionLogsBucket}/${AgentVaultSessionLogsKeyPrefix}/*" },
      { "Fn::Sub": "arn:${AWS::Partition}:s3:::${AgentVaultSessionLogsBucket}/*" }
    ]
  });
  assert.deepEqual(bucket.Condition, {
    "Fn::If": [
      "HasAgentVaultSessionLogsKeyPrefix",
      { StringLike: { "s3:prefix": { "Fn::Sub": "${AgentVaultSessionLogsKeyPrefix}/*" } } },
      { Ref: "AWS::NoValue" }
    ]
  });
});

test("the session logs key prefix accepts what Session Logs accepts", () => {
  const { AllowedPattern, MaxLength } = template.Parameters.AgentVaultSessionLogsKeyPrefix;
  const pattern = new RegExp(`^${AllowedPattern}$`);
  assert.equal(MaxLength, 256);
  for (const prefix of ["", "logs", "team's-logs", "a/b_c/(d).e!", "logs/agent-vault", "..x/y."]) {
    assert.ok(pattern.test(prefix), prefix);
  }
  for (const prefix of ["/logs", "logs/", "a//b", "logs*", "a@b", "a b", ".", "..", "a/./b", "a/.."]) {
    assert.ok(!pattern.test(prefix), prefix);
  }
});
