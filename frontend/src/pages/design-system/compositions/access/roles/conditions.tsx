import { useId, useState } from "react";
import picomatch from "picomatch";

import { Alert } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import { Select } from "@app/components/v4/ui/select";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { environments } from "../model";
import { Gate } from "../ui";
import {
  actionLabel,
  allowedConditions,
  type Condition,
  disallowingActions,
  type Operator,
  PROJECT_TAGS,
  type RuleErrors
} from "./permissions-model";

import styles from "./roles.module.css";

type ConditionOption = { value: string; label: string; description: string };

const ENVIRONMENT: ConditionOption = {
  value: "environment",
  label: "Environment slug",
  description: "The environment slug (e.g., dev, staging, prod)"
};
const SECRET_PATH: ConditionOption = {
  value: "secretPath",
  label: "Secret path",
  description: "The path within an environment (e.g., /app/config)"
};
const CONNECTION_ID: ConditionOption = {
  value: "connectionId",
  label: "App connection ID",
  description: "App Connection identifier"
};
const assignable = (target: string): ConditionOption[] => [
  {
    value: "assignableRole",
    label: "Assignable roles",
    description: `The roles that the actor is allowed to assign to the target ${target}. (e.g., admin, member, viewer)`
  },
  {
    value: "assignableSubject",
    label: "Assignable subjects",
    description: `The permission subjects that the actor is allowed to grant in additional privileges to the target ${target}. (e.g., secrets, environments, members)`
  },
  {
    value: "assignableAction",
    label: "Assignable actions",
    description: `The specific actions that the actor is allowed to grant in additional privileges to the target ${target}. (e.g., secrets:describeSecret, environments:edit)`
  }
];

const GENERAL = [ENVIRONMENT, SECRET_PATH];

export const CONDITION_OPTIONS: Record<string, ConditionOption[]> = {
  secrets: [
    ENVIRONMENT,
    SECRET_PATH,
    { value: "secretName", label: "Secret name", description: "The name of a specific secret" },
    { value: "secretTags", label: "Secret tags", description: "Tags associated with secrets" }
  ],
  "dynamic-secrets": [
    ENVIRONMENT,
    SECRET_PATH,
    {
      value: "metadataKey",
      label: "Metadata key",
      description: "The key of a metadata pair (use with $elemMatch for nested matching)"
    },
    {
      value: "metadataValue",
      label: "Metadata value",
      description: "The value of a metadata pair (use with $elemMatch for nested matching)"
    }
  ],
  "secret-folders": GENERAL,
  "secret-imports": GENERAL,
  commits: GENERAL,
  "honey-tokens": GENERAL,
  "proxied-services": GENERAL,
  "project-folder-grant": GENERAL,
  identity: [
    {
      value: "identityId",
      label: "Identity ID",
      description: "The unique identifier of the target machine identity"
    },
    ...assignable("machine identities")
  ],
  member: [
    {
      value: "userEmail",
      label: "User email",
      description: "The email address of the target user"
    },
    ...assignable("users")
  ],
  groups: [
    { value: "groupName", label: "Group name", description: "The name of the target group" },
    {
      value: "assignableRole",
      label: "Assignable roles",
      description:
        "The roles that the actor is allowed to assign to the target groups. (e.g., admin, member, viewer)"
    }
  ],
  "secret-rotation": [ENVIRONMENT, SECRET_PATH, CONNECTION_ID],
  "secret-syncs": [ENVIRONMENT, SECRET_PATH, CONNECTION_ID],
  "secret-event-subscriptions": GENERAL,
  "app-connections": [
    {
      value: "connectionId",
      label: "Connection ID",
      description: "Connection identifier for app connections"
    }
  ]
};

const EQ = { value: "$eq", label: "Equal" };
const NEQ = { value: "$neq", label: "Not equal" };
const IN = { value: "$in", label: "In" };
const GLOB = { value: "$glob", label: "Glob match" };

const operatorsFor = (lhs: string) => {
  if (lhs === "secretTags")
    return [
      { value: "$in", label: "Contains" },
      { value: "$all", label: "Contains all" }
    ];
  if (
    ["metadataKey", "metadataValue", "identityId", "connectionId", "role", "eventType"].includes(
      lhs
    )
  )
    return [EQ, NEQ, IN];
  return [EQ, NEQ, GLOB, IN];
};

const OPERATOR_HELP: Record<string, string> = {
  $eq: "Value should equal specified value.",
  $neq: "Value should not equal specified value.",
  $in: "List of comma-separated values that match a given value.",
  $all: "List of comma-separated values that must all be present."
};

const defaultOperator = (lhs: string): Operator => (lhs === "secretTags" ? "$in" : "$eq");

const GlobInfo = () => {
  const id = useId();
  const [pattern, setPattern] = useState("");
  const [text, setText] = useState("");
  const hasInput = Boolean(pattern && text);
  const isMatch = hasInput && picomatch.isMatch(text, pattern, { strictSlashes: false });
  return (
    <div className={styles.globInfo}>
      <p>A glob pattern uses special wildcard characters to match resources or paths:</p>
      <ul className={styles.globList}>
        <li>
          <code>*</code> matches any characters except <code>/</code> (e.g., <code>dev-*</code>{" "}
          matches <code>dev-api</code>)
        </li>
        <li>
          <code>**</code> matches across multiple levels, including <code>/</code> (e.g.,{" "}
          <code>/services/**</code>)
        </li>
        <li>
          <code>?</code> matches exactly one character (e.g., <code>db-?</code>)
        </li>
        <li>
          <code>{"{a,b}"}</code> matches either alternative
        </li>
      </ul>
      <p className={styles.muted}>
        A trailing <code>{"/*"}</code> matches a folder&apos;s direct children only, not the folder
        itself: <code>/app/*</code> does not match secrets directly in <code>/app</code>. Use{" "}
        <code>/app/**</code> to match a folder and everything under it.
      </p>
      <Field
        label="Glob pattern"
        description="Examples: dev-*, /services/**, config-?, {dev,staging}-*"
      >
        <Input
          id={`${id}-pattern`}
          mono
          value={pattern}
          placeholder="/app/**"
          onChange={(event) => setPattern(event.target.value)}
        />
      </Field>
      <Field
        label="Test string"
        description={hasInput ? undefined : "Type a value to test the pattern against"}
      >
        <Input
          id={`${id}-test`}
          mono
          value={text}
          placeholder="/app/config"
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      {hasInput && (
        <p className={styles.globResult} data-match={isMatch || undefined} role="status">
          {isMatch ? "Matches the pattern" : "Does not match the pattern"}
        </p>
      )}
    </div>
  );
};

const HintIcon = ({ content, label }: { content: string; label: string }) => (
  <Tooltip content={content}>
    <button type="button" className={styles.hint} aria-label={label}>
      <Icon name="info" size={14} />
    </button>
  </Tooltip>
);

export const ConditionsFields = ({
  subject,
  actions,
  conditions,
  onChange,
  disabled,
  reason,
  errors,
  scopeLabel
}: {
  subject: string;
  actions: readonly string[];
  conditions: readonly Condition[];
  onChange: (conditions: Condition[]) => void;
  disabled: boolean;
  reason: string;
  errors?: RuleErrors["conditions"];
  scopeLabel: string;
}) => {
  const [, setChecks] = useState(0);
  const options = CONDITION_OPTIONS[subject] ?? GENERAL;
  const allowed = allowedConditions(
    subject,
    actions,
    options.map((option) => option.value)
  );
  const used = conditions.map((condition) => condition.lhs);
  const available = options.filter(
    (option) => allowed.includes(option.value) && !used.includes(option.value)
  );
  const label = (action: string) => actionLabel("project", subject, action);
  const incompatible = conditions.flatMap((condition) => {
    const blocked = disallowingActions(subject, condition.lhs, actions);
    if (!blocked.length) return [];
    return [
      {
        key: condition.lhs,
        label: options.find((option) => option.value === condition.lhs)?.label ?? condition.lhs,
        actions: blocked.map(label).join(", ")
      }
    ];
  });

  if (disabled && !conditions.length) return null;

  const patch = (index: number, next: Partial<Condition>) =>
    onChange(conditions.map((item, i) => (i === index ? { ...item, ...next } : item)));

  let addReason: string | undefined;
  if (disabled) addReason = reason;
  else if (!available.length)
    addReason = allowed.length
      ? "All available conditions have been added"
      : "No conditions available for the selected group of actions.";

  return (
    <div className={styles.conditions}>
      <div className={styles.conditionsHead}>
        <span className={styles.conditionsTitle}>
          Conditions
          <HintIcon
            label="About conditions"
            content="Conditions determine when a policy will be applied (always if no conditions are present). All conditions must evaluate to true for the policy to take effect."
          />
        </span>
        <span className={styles.policyActions}>
          {conditions.some(({ lhs }) => lhs === "environment" || lhs === "secretTags") && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              icon="sync"
              onClick={() => setChecks((count) => count + 1)}
            >
              Refresh references
            </Button>
          )}
          <Gate allowed={!addReason} reason={addReason}>
            <Button
              type="button"
              variant="outline"
              size="xs"
              icon="plus"
              disabled={Boolean(addReason)}
              onClick={() => {
                const lhs = available[0]?.value ?? options[0].value;
                onChange([...conditions, { lhs, operator: defaultOperator(lhs), rhs: "" }]);
              }}
            >
              Add condition
            </Button>
          </Gate>
        </span>
      </div>
      {incompatible.length > 0 && (
        <Alert
          tone="bad"
          title={`${incompatible.length} condition${incompatible.length > 1 ? "s" : ""} incompatible with selected actions`}
        >
          <ul className={styles.plainList}>
            {incompatible.map((item) => (
              <li key={item.key}>
                <strong>{item.label} not available for the actions:</strong> {item.actions}
              </li>
            ))}
          </ul>
          <p>
            Remove the incompatible conditions or update the selected actions to make them
            compatible.
          </p>
        </Alert>
      )}
      {conditions.length > 0 && (
        <div className={styles.conditionRows}>
          {conditions.map((condition, index) => {
            const option = options.find((item) => item.value === condition.lhs);
            const error = errors?.[index];
            const isReference = condition.lhs === "environment" || condition.lhs === "secretTags";
            const isLiteral = ["$eq", "$neq", "$in", "$all"].includes(condition.operator);
            const known =
              condition.lhs === "environment" ? environments.map((env) => env.value) : PROJECT_TAGS;
            const values =
              condition.operator === "$in" || condition.operator === "$all"
                ? condition.rhs.split(",")
                : [condition.rhs];
            const unknown =
              isReference && isLiteral
                ? [...new Set(values)].filter((slug) => slug !== "" && !known.includes(slug))
                : [];
            return (
              <div key={condition.lhs} className={styles.condition}>
                <div className={styles.conditionRow}>
                  <div className={styles.conditionCell}>
                    {index > 0 && (
                      <Tooltip content="All conditions must be true for this policy to apply">
                        <Badge tone="outline">and</Badge>
                      </Tooltip>
                    )}
                    <div className={styles.grow}>
                      <Select
                        size="sm"
                        label={`Condition ${index + 1} property for ${scopeLabel}`}
                        value={condition.lhs}
                        disabled={disabled}
                        invalid={Boolean(error?.lhs)}
                        options={options
                          .filter(
                            (item) => !used.includes(item.value) || item.value === condition.lhs
                          )
                          .map((item) => {
                            const blocked = disallowingActions(subject, item.value, actions);
                            return {
                              value: item.value,
                              label: item.label,
                              disabled: !allowed.includes(item.value),
                              description: blocked.length
                                ? `Not available for: ${blocked.map(label).join(", ")}`
                                : undefined
                            };
                          })}
                        onChange={(lhs) => patch(index, { lhs, operator: defaultOperator(lhs) })}
                      />
                    </div>
                    {option && (
                      <HintIcon label={`About ${option.label}`} content={option.description} />
                    )}
                  </div>
                  <div className={styles.operatorCell}>
                    <div className={styles.grow}>
                      <Select
                        size="sm"
                        label={`Condition ${index + 1} operator for ${scopeLabel}`}
                        value={condition.operator}
                        disabled={disabled}
                        options={operatorsFor(condition.lhs)}
                        onChange={(operator) => patch(index, { operator: operator as Operator })}
                      />
                    </div>
                    {condition.operator === "$glob" ? (
                      <Popover>
                        <Tooltip content="Glob pattern reference">
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              icon="info"
                              iconOnly
                            >
                              Glob pattern reference
                            </Button>
                          </PopoverTrigger>
                        </Tooltip>
                        <PopoverContent align="end" className={styles.globPopover}>
                          <GlobInfo />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <HintIcon
                        label="About this operator"
                        content={OPERATOR_HELP[condition.operator] ?? ""}
                      />
                    )}
                  </div>
                  <div className={styles.grow}>
                    <Input
                      aria-label={`Condition ${index + 1} value for ${scopeLabel}`}
                      value={condition.rhs}
                      disabled={disabled}
                      invalid={Boolean(error?.rhs)}
                      onChange={(event) => patch(index, { rhs: event.target.value })}
                    />
                  </div>
                  <Gate allowed={!disabled} reason={reason}>
                    <Tooltip content="Remove condition">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        icon="trash"
                        iconOnly
                        disabled={disabled}
                        onClick={() => onChange(conditions.filter((_, i) => i !== index))}
                      >
                        Remove condition
                      </Button>
                    </Tooltip>
                  </Gate>
                </div>
                {(error?.lhs || error?.rhs) && (
                  <p className={styles.error} role="alert">
                    {error.lhs ?? error.rhs}
                  </p>
                )}
                {unknown.length > 0 && (
                  <p className={styles.warning} role="status">
                    <Icon name="alert" size={14} />
                    {`${condition.lhs === "environment" ? "Environment" : "Tag"}${unknown.length > 1 ? "s" : ""} ${unknown
                      .map((slug) => JSON.stringify(slug))
                      .join(
                        ", "
                      )} ${unknown.length === 1 ? "doesn't" : "don't"} exist in your project. You can still save.`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
