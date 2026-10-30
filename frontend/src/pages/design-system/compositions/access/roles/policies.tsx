import { Fragment } from "react";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@app/components/v4/ui/accordion";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Select } from "@app/components/v4/ui/select";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import type { Scope } from "../model";
import { Gate } from "../ui";
import type { PermissionSubject } from "./catalog";
import { ConditionsFields } from "./conditions";
import { emptyRule, type Rule, type RuleErrors } from "./permissions-model";

import styles from "./roles.module.css";

const LEGACY_PROJECT_ACTIONS: Record<string, string> = {
  member: "grant-privileges",
  identity: "grant-privileges",
  groups: "grant-privileges"
};

const VISUALIZABLE = ["secrets", "secret-folders", "dynamic-secrets", "secret-imports"];

const visibleActions = (scope: Scope, config: PermissionSubject, rule: Rule) =>
  config.actions.filter(({ value }) => {
    if (config.subject === "secrets" && value === "read") return rule.actions.includes(value);
    if (scope === "project" && LEGACY_PROJECT_ACTIONS[config.subject] === value)
      return rule.actions.includes(value);
    return true;
  });

export const PolicyItem = ({
  scope,
  config,
  rules,
  open,
  disabled,
  reason,
  errors,
  onChange,
  onRemovePolicy
}: {
  scope: Scope;
  config: PermissionSubject;
  rules: Rule[];
  open: boolean;
  disabled: boolean;
  reason: string;
  errors?: Record<number, RuleErrors>;
  onChange: (rules: Rule[]) => void;
  onRemovePolicy: () => void;
}) => {
  const conditional = scope === "project" && Boolean(config.conditional);
  const patch = (index: number, next: Partial<Rule>) =>
    onChange(rules.map((item, i) => (i === index ? { ...item, ...next } : item)));
  return (
    <AccordionItem value={config.subject}>
      <div className={styles.policyHead}>
        <AccordionTrigger>
          <span className={styles.policyText}>
            <span className={styles.policyTitle}>{config.title}</span>
            <span className={styles.policyDescription}>{config.description}</span>
          </span>
          {rules.length > 1 && <Badge tone="soft">{`${rules.length} rules`}</Badge>}
        </AccordionTrigger>
        {open && (conditional || VISUALIZABLE.includes(config.subject)) && (
          <div className={styles.policyActions}>
            {scope === "project" && VISUALIZABLE.includes(config.subject) && (
              <Gate allowed={false} reason="Access visualization is not part of this preview">
                <Button type="button" variant="outline" size="xs" icon="apps" disabled>
                  Visualize access
                </Button>
              </Gate>
            )}
            {conditional && (
              <Gate allowed={!disabled} reason={reason}>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  icon="plus"
                  disabled={disabled}
                  onClick={() => onChange([...rules, emptyRule()])}
                >
                  Add rule
                </Button>
              </Gate>
            )}
          </div>
        )}
      </div>
      <AccordionContent>
        <div className={styles.rules}>
          {rules.map((rule, index) => {
            const error = errors?.[index];
            const options = visibleActions(scope, config, rule);
            const removeLabel = rules.length === 1 ? "Remove policy" : "Remove rule";
            return (
              <Fragment key={rule.id}>
                {index > 0 && (
                  <div className={styles.or}>
                    <span className={styles.orLine} />
                    <Tooltip content="At least one rule must match for this permission to apply">
                      <Badge tone="outline">or</Badge>
                    </Tooltip>
                    <span className={styles.orLine} />
                  </div>
                )}
                <div className={styles.rule} data-inverted={rule.inverted || undefined}>
                  <div className={styles.ruleRow}>
                    {conditional && (
                      <div className={styles.ruleEffect}>
                        <Select
                          size="sm"
                          label={`Rule ${index + 1} effect for ${config.title}`}
                          value={String(rule.inverted)}
                          disabled={disabled}
                          options={[
                            { value: "false", label: "Allow" },
                            { value: "true", label: "Forbid" }
                          ]}
                          onChange={(value) => patch(index, { inverted: value === "true" })}
                        />
                      </div>
                    )}
                    <div className={styles.ruleActions}>
                      <Combobox
                        multiple
                        label={`Rule ${index + 1} actions for ${config.title}`}
                        placeholder="Select actions..."
                        emptyText="No permission actions found."
                        disabled={disabled}
                        invalid={Boolean(error?.actions)}
                        options={options.map((action) => ({
                          value: action.value,
                          label: action.label,
                          meta: action.description
                        }))}
                        value={rule.actions}
                        onChange={(actions) => patch(index, { actions })}
                      />
                      {error?.actions && (
                        <p className={styles.error} role="alert">
                          {error.actions}
                        </p>
                      )}
                    </div>
                    <Gate allowed={!disabled} reason={reason}>
                      <Tooltip content={removeLabel}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          icon="trash"
                          iconOnly
                          disabled={disabled}
                          onClick={() =>
                            rules.length === 1
                              ? onRemovePolicy()
                              : onChange(rules.filter((_, i) => i !== index))
                          }
                        >
                          {`${removeLabel} for ${config.title}`}
                        </Button>
                      </Tooltip>
                    </Gate>
                  </div>
                  {conditional && (
                    <ConditionsFields
                      subject={config.subject}
                      scopeLabel={config.title}
                      actions={rule.actions}
                      conditions={rule.conditions}
                      disabled={disabled}
                      reason={reason}
                      errors={error?.conditions}
                      onChange={(conditions) => patch(index, { conditions })}
                    />
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
