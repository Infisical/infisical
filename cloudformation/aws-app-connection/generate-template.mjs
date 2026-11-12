import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const USE_CASES_PATH = path.resolve(dir, "../../docs/snippets/app-connections/aws/use-cases.jsx");
export const TEMPLATE_PATH = path.join(dir, "infisical-aws-app-connection.yaml");
export const TEMPLATE_VERSION = "1";

const loadUseCaseGroups = () => {
  const source = readFileSync(USE_CASES_PATH, "utf8").replace("export const awsUseCaseGroups =", "return");
  return new Function(source)();
};

export const awsUseCaseGroups = loadUseCaseGroups();

const PLACEHOLDER_PARAMETERS = {
  "recording-bucket": {
    name: "PamRecordingBucket",
    label: "PAM recording S3 bucket",
    description: "Name of the S3 bucket PAM session recordings are written to",
    pattern: "([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])?"
  },
  "session-logs-bucket": {
    name: "AgentVaultSessionLogsBucket",
    label: "Agent Vault session logs S3 bucket",
    description: "Name of the S3 bucket Agent Vault session logs are written to",
    pattern: "([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])?"
  },
  "key-prefix": {
    name: "AgentVaultSessionLogsKeyPrefix",
    label: "Agent Vault session logs key prefix",
    description:
      "Key prefix Agent Vault session logs are written under, without a leading or trailing slash. Leave empty if session logs are written at the bucket root",
    // Mirrors keyPrefixSchema (object-storage-path-fns.ts), so every prefix Session Logs accepts can be provisioned.
    pattern: "((?!(.*/)?\\.{1,2}(/|$))[A-Za-z0-9!_.'()-]+(/[A-Za-z0-9!_.'()-]+)*)?",
    maxLength: 256,
    optional: true
  },
  "hosted-zone-id": {
    name: "Route53HostedZoneId",
    label: "Route 53 hosted zone ID",
    description: "ID of the Route 53 hosted zone used for ACM validation or ACME challenges",
    pattern: "([A-Z0-9]{1,32})?"
  }
};

const WHOLE_ARN_PARAMETERS = [
  {
    match: /^arn:aws:acm-pca:<region>:<account-id>:certificate-authority\/<ca-id>$/,
    name: "PrivateCaArn",
    label: "Private CA ARN",
    description: "ARN of the AWS Private CA that Infisical issues certificates from",
    pattern: "(arn:aws[\\w-]*:acm-pca:[\\w-]+:\\d{12}:certificate-authority/[\\w-]+)?"
  }
];

const pascal = (id) => id.replace(/(^|-)(\w)/g, (_, __, char) => char.toUpperCase());

const toggleName = (id) => `Enable${pascal(id)}`;
const kmsToggleName = (id) => `Enable${pascal(id)}Kms`;

const ref = (name) => ({ Ref: name });
const equalsTrue = (name) => ({ "Fn::Equals": [ref(name), "true"] });
const anyOf = (conditions) => (conditions.length === 1 ? conditions[0] : { "Fn::Or": conditions });

const hasValueCondition = (name) => `Has${name}`;

const optionalPlaceholderIn = (value) => {
  const key = Object.keys(PLACEHOLDER_PARAMETERS).find(
    (placeholder) => PLACEHOLDER_PARAMETERS[placeholder].optional && JSON.stringify(value).includes(`<${placeholder}>`)
  );
  return key && { key, parameter: PLACEHOLDER_PARAMETERS[key] };
};

// An optional placeholder may be left empty, so a string that uses it becomes an Fn::If between the
// string with the value and the string without it. `<key-prefix>/` is dropped along with its slash,
// or an empty prefix would leave `bucket//*` in the policy.
const convertString = (value, usedParameters, isOptionalSet = false) => {
  const whole = WHOLE_ARN_PARAMETERS.find((entry) => entry.match.test(value));
  if (whole) {
    usedParameters.set(whole.name, whole);
    return ref(whole.name);
  }

  const optional = isOptionalSet ? undefined : optionalPlaceholderIn(value);
  if (optional) {
    return {
      "Fn::If": [
        hasValueCondition(optional.parameter.name),
        convertString(value, usedParameters, true),
        convertString(value.replace(new RegExp(`<${optional.key}>/?`, "g"), ""), usedParameters, true)
      ]
    };
  }

  if (!value.startsWith("arn:aws:") && !/<[\w-]+>/.test(value)) return value;

  const substituted = value.replace(/^arn:aws:/, "arn:${AWS::Partition}:").replace(/<([\w-]+)>/g, (_, key) => {
    const parameter = PLACEHOLDER_PARAMETERS[key];
    if (!parameter) throw new Error(`No template parameter is mapped for placeholder <${key}>`);
    usedParameters.set(parameter.name, parameter);
    return `\${${parameter.name}}`;
  });
  return { "Fn::Sub": substituted };
};

// A statement Condition on an optional placeholder (an s3:prefix match) only holds when the value is
// set: with no prefix the request carries no s3:prefix, so the condition would deny every listing.
// The whole Condition is dropped instead.
const convertValue = (value, usedParameters, isOptionalSet = false) => {
  if (typeof value === "string") return convertString(value, usedParameters, isOptionalSet);
  if (Array.isArray(value)) return value.map((item) => convertValue(item, usedParameters, isOptionalSet));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const optional = !isOptionalSet && key === "Condition" ? optionalPlaceholderIn(item) : undefined;
        if (!optional) return [key, convertValue(item, usedParameters, isOptionalSet)];
        return [
          key,
          {
            "Fn::If": [
              hasValueCondition(optional.parameter.name),
              convertValue(item, usedParameters, true),
              ref("AWS::NoValue")
            ]
          }
        ];
      })
    );
  }
  return value;
};

export const buildTemplate = () => {
  const parameters = {
    ExternalId: {
      Type: "String",
      Description: "External ID Infisical sends when assuming the role: a Project ID or an Organization ID",
      AllowedPattern: "[\\w+=,.@:/-]{2,1224}",
      ConstraintDescription: "Enter the ID shown in Infisical"
    },
    TrustedAccountId: {
      Type: "String",
      Description: "ID of the AWS account whose principals are allowed to assume the role",
      AllowedPattern: "\\d{12}",
      ConstraintDescription: "Enter a 12-digit AWS account ID"
    },
    RoleName: {
      Type: "String",
      Default: "infisical-app-connection",
      Description: "Name of the IAM role to create",
      AllowedPattern: "[\\w+=,.@-]{1,64}",
      ConstraintDescription: "Use up to 64 letters, digits, and the characters +=,.@_-"
    }
  };
  const conditions = {};
  const rules = {};
  const policies = {};
  const resourceParameterToggles = new Map();
  const resourceParameterDefinitions = new Map();
  const groups = [{ Label: { default: "Role" }, Parameters: ["ExternalId", "TrustedAccountId", "RoleName"] }];
  const labels = { ExternalId: "External ID", TrustedAccountId: "Trusted account ID", RoleName: "Role name" };

  for (const group of awsUseCaseGroups) {
    const groupParameters = [];

    for (const option of group.options.filter((entry) => entry.policy)) {
      const toggle = toggleName(option.id);
      parameters[toggle] = {
        Type: "String",
        Default: "false",
        AllowedValues: ["true", "false"],
        Description: `Grant the permissions for ${option.label}`
      };
      groupParameters.push(toggle);
      labels[toggle] = option.label;
      conditions[`Use${pascal(option.id)}`] = equalsTrue(toggle);

      const usedParameters = new Map();
      const statements = convertValue(option.policy.statements, usedParameters);
      policies[`${pascal(option.id)}Policy`] = {
        Type: "AWS::IAM::RolePolicy",
        Condition: `Use${pascal(option.id)}`,
        Properties: {
          RoleName: ref("Role"),
          PolicyName: `infisical-${option.id}`,
          PolicyDocument: { Version: "2012-10-17", Statement: statements }
        }
      };

      for (const [name, definition] of usedParameters) {
        resourceParameterDefinitions.set(name, definition);
        resourceParameterToggles.set(name, [...(resourceParameterToggles.get(name) ?? []), toggle]);
      }

      if (option.policy.optional) {
        const kmsToggle = kmsToggleName(option.id);
        parameters[kmsToggle] = {
          Type: "String",
          Default: "false",
          AllowedValues: ["true", "false"],
          Description: `Also grant the extra permissions needed when ${option.label} ${option.policy.optional.label}`
        };
        groupParameters.push(kmsToggle);
        labels[kmsToggle] = `${option.label}: ${option.policy.optional.label}`;
        conditions[`Use${pascal(option.id)}Kms`] = {
          "Fn::And": [{ Condition: `Use${pascal(option.id)}` }, equalsTrue(kmsToggle)]
        };
        policies[`${pascal(option.id)}KmsPolicy`] = {
          Type: "AWS::IAM::RolePolicy",
          Condition: `Use${pascal(option.id)}Kms`,
          Properties: {
            RoleName: ref("Role"),
            PolicyName: `infisical-${option.id}-kms`,
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: convertValue(option.policy.optional.statements, new Map())
            }
          }
        };
      }
    }

    groups.push({ Label: { default: group.label }, Parameters: groupParameters });
  }

  const resourceGroup = { Label: { default: "Resources for the selected use cases" }, Parameters: [] };
  for (const [name, toggles] of resourceParameterToggles) {
    const { label, description, pattern, maxLength, optional } = resourceParameterDefinitions.get(name);
    parameters[name] = {
      Type: "String",
      Default: "",
      Description: description,
      AllowedPattern: pattern,
      ...(maxLength && { MaxLength: maxLength })
    };
    resourceGroup.Parameters.push(name);
    labels[name] = label;
    if (optional) {
      conditions[hasValueCondition(name)] = { "Fn::Not": [{ "Fn::Equals": [ref(name), ""] }] };
      continue;
    }
    rules[`Require${name}`] = {
      RuleCondition: anyOf(toggles.map(equalsTrue)),
      Assertions: [
        {
          Assert: { "Fn::Not": [{ "Fn::Equals": [ref(name), ""] }] },
          AssertDescription: `${name} is required when a use case that needs it is enabled`
        }
      ]
    };
  }
  groups.push(resourceGroup);

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "Infisical AWS App Connection. Creates an IAM role that Infisical assumes, with no long-lived credentials.",
    Metadata: {
      InfisicalTemplateVersion: TEMPLATE_VERSION,
      "cfn-lint": { config: { ignore_checks: ["W1030", "W1031"] } },
      "AWS::CloudFormation::Interface": {
        ParameterGroups: groups,
        ParameterLabels: Object.fromEntries(Object.entries(labels).map(([name, label]) => [name, { default: label }]))
      }
    },
    Parameters: parameters,
    Rules: rules,
    Conditions: conditions,
    Resources: {
      Role: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: ref("RoleName"),
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { AWS: { "Fn::Sub": "arn:${AWS::Partition}:iam::${TrustedAccountId}:root" } },
                Action: "sts:AssumeRole",
                Condition: { StringEquals: { "sts:ExternalId": ref("ExternalId") } }
              }
            ]
          }
        }
      },
      ...policies
    },
    Outputs: {
      RoleArn: {
        Description: "Paste this value into the Role ARN field in Infisical",
        Value: { "Fn::GetAtt": ["Role", "Arn"] }
      }
    }
  };
};

const renderScalar = (value) => (typeof value === "string" ? JSON.stringify(value) : String(value));
const renderKey = (key) => (/^\w+$/.test(key) ? key : JSON.stringify(key));
const isContainer = (value) => value !== null && typeof value === "object";

const renderYaml = (value, indent) => {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!isContainer(item)) return `${pad}- ${renderScalar(item)}`;
        const [first, ...rest] = renderYaml(item, indent + 1).split("\n");
        return [`${pad}- ${first.trimStart()}`, ...rest].join("\n");
      })
      .join("\n");
  }
  return Object.entries(value)
    .map(([key, item]) => {
      if (!isContainer(item)) return `${pad}${renderKey(key)}: ${renderScalar(item)}`;
      if (Array.isArray(item) && item.length === 0) return `${pad}${renderKey(key)}: []`;
      return `${pad}${renderKey(key)}:\n${renderYaml(item, indent + 1)}`;
    })
    .join("\n");
};

export const renderTemplate = () =>
  `# Generated by generate-template.mjs from docs/snippets/app-connections/aws/use-cases.jsx. Do not edit.\n${renderYaml(buildTemplate(), 0)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rendered = renderTemplate();
  if (process.argv.includes("--check")) {
    if (readFileSync(TEMPLATE_PATH, "utf8") !== rendered) {
      console.error("infisical-aws-app-connection.yaml is stale. Run: node cloudformation/aws-app-connection/generate-template.mjs");
      process.exit(1);
    }
  } else {
    writeFileSync(TEMPLATE_PATH, rendered);
  }
}
