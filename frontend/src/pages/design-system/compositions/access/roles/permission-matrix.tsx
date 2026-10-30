import { type ReactNode, useMemo, useState } from "react";
import { BanIcon, FilterIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import { Tabs } from "@app/components/v4/ui/tabs";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import type { Scope } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Muted } from "../ui";
import type { PermissionAction, PermissionSubject } from "./catalog";
import {
  type PermissionErrors,
  type RolePermissions,
  type Rule,
  ruleId
} from "./permissions-model";
import { conditionsText, matrixActions, VERBS, type Verb, verbOf } from "./rule-summary";
import { SubjectRulesSheet } from "./subject-rules-sheet";

import styles from "./roles.module.css";

export type MatrixProps = {
  scope: Scope;
  draft: RolePermissions;
  subjects: readonly PermissionSubject[];
  editable: boolean;
  reason: string;
  errors?: PermissionErrors;
  onChange: (next: RolePermissions) => void;
  initialSubject?: string;
  initialShow?: "granted" | "all";
};

const isBase = (rule: Rule) => !rule.inverted && rule.conditions.length === 0;

const baseActions = (rules: readonly Rule[]) => rules.find(isBase)?.actions ?? [];

const setBase = (draft: RolePermissions, subject: string, actions: string[]): RolePermissions => {
  const rules = draft[subject] ?? [];
  const index = rules.findIndex(isBase);
  let next: Rule[];
  if (index === -1)
    next = actions.length
      ? [{ id: ruleId(), inverted: false, conditions: [], actions }, ...rules]
      : rules;
  else if (actions.length)
    next = rules.map((rule, i) => (i === index ? { ...rule, actions } : rule));
  else next = rules.filter((_, i) => i !== index);
  const { [subject]: _removed, ...rest } = draft;
  return next.length ? { ...rest, [subject]: next } : rest;
};

type Scoped = { action: PermissionAction; text: string };

const scopedRules = (
  config: PermissionSubject,
  rules: readonly Rule[],
  actions: readonly PermissionAction[],
  inverted: boolean
): Scoped[] =>
  rules
    .filter((rule) => rule.inverted === inverted && (inverted || rule.conditions.length > 0))
    .flatMap((rule) =>
      actions
        .filter((action) => rule.actions.includes(action.value))
        .map((action) => ({
          action,
          text: rule.conditions.length
            ? `where ${conditionsText(config.subject, rule.conditions)}`
            : "everywhere"
        }))
    );

const Marks = ({
  config,
  rules,
  actions
}: {
  config: PermissionSubject;
  rules: readonly Rule[];
  actions: readonly PermissionAction[];
}) => {
  const conditional = scopedRules(config, rules, actions, false);
  const forbidden = scopedRules(config, rules, actions, true);
  const line = (item: Scoped, verb: string) => (
    <li key={`${item.action.value}-${verb}-${item.text}`}>
      {`${item.action.label}: ${verb} ${item.text}`}
    </li>
  );
  return (
    <>
      {conditional.length > 0 && (
        <Tooltip
          content={
            <ul className={styles.markList}>{conditional.map((item) => line(item, "allowed"))}</ul>
          }
        >
          <button
            type="button"
            className={styles.mark}
            data-tone="conditional"
            aria-label={conditional
              .map((item) => `${item.action.label} allowed ${item.text}`)
              .join("; ")}
          >
            <Icon icon={FilterIcon} size={14} />
          </button>
        </Tooltip>
      )}
      {forbidden.length > 0 && (
        <Tooltip
          content={
            <ul className={styles.markList}>{forbidden.map((item) => line(item, "forbidden"))}</ul>
          }
        >
          <button
            type="button"
            className={styles.mark}
            data-tone="forbid"
            aria-label={forbidden
              .map((item) => `${item.action.label} forbidden ${item.text}`)
              .join("; ")}
          >
            <Icon icon={BanIcon} size={14} />
          </button>
        </Tooltip>
      )}
    </>
  );
};

const GrantCheckbox = ({
  config,
  actions,
  granted,
  disabled,
  onToggle
}: {
  config: PermissionSubject;
  actions: readonly PermissionAction[];
  granted: readonly string[];
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) => {
  const values = actions.map((action) => action.value);
  const on = values.filter((value) => granted.includes(value)).length;
  const label = actions.map((action) => action.label).join(", ");
  const list = (items: readonly PermissionAction[]) =>
    items.map((action) => action.label).join(", ");
  const partial = on > 0 && on < values.length;
  return (
    <Tooltip
      content={
        partial
          ? `Allowed everywhere: ${list(actions.filter((action) => granted.includes(action.value)))}. Not allowed: ${list(actions.filter((action) => !granted.includes(action.value)))}.`
          : `${label}, everywhere`
      }
    >
      <span className={styles.matrixCheck}>
        <Checkbox
          aria-label={`Allow ${label} for ${config.title} everywhere`}
          disabled={disabled}
          checked={on === values.length || (on > 0 && "indeterminate")}
          onCheckedChange={() => onToggle(on !== values.length)}
        />
      </span>
    </Tooltip>
  );
};

export const PermissionMatrix = (props: MatrixProps) => {
  const { draft, subjects, editable, reason, errors, onChange } = props;
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"granted" | "all">(props.initialShow ?? "granted");
  const [editing, setEditing] = useState<string | undefined>(props.initialSubject);
  const granted = subjects.filter((subject) => draft[subject.subject]?.length);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (show === "granted" ? granted : subjects).filter((subject) =>
      [subject.title, subject.description].some((value) => value.toLowerCase().includes(needle))
    );
  }, [query, show, granted, subjects]);

  const toggle = (config: PermissionSubject, values: readonly string[], on: boolean) => {
    const base = baseActions(draft[config.subject] ?? []);
    onChange(
      setBase(
        draft,
        config.subject,
        on ? [...new Set([...base, ...values])] : base.filter((value) => !values.includes(value))
      )
    );
  };

  const cell = (config: PermissionSubject, verb: Verb): ReactNode => {
    const actions = matrixActions(config).filter((action) => verbOf(action.value) === verb);
    if (!actions.length) return <Muted>-</Muted>;
    const rules = draft[config.subject] ?? [];
    const base = baseActions(rules);
    if (verb === "other") {
      const on = actions.filter((action) => base.includes(action.value)).length;
      return (
        <span className={styles.matrixCell}>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="xs"
                iconRight="chev-down"
                aria-label={`${on} of ${actions.length} other actions for ${config.title}`}
              >
                {`${on} of ${actions.length}`}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" style={{ width: 320 }}>
              <Stack gap={8}>
                <strong className={styles.popoverTitle}>{`${config.title}: other actions`}</strong>
                <ul className={styles.otherList}>
                  {actions.map((action) => (
                    <li key={action.value} className={styles.otherRow}>
                      <div className={styles.otherLabel}>
                        <Checkbox
                          id={`other-${config.subject}-${action.value}`}
                          disabled={!editable}
                          checked={base.includes(action.value)}
                          onCheckedChange={(value) =>
                            toggle(config, [action.value], value === true)
                          }
                        />
                        <label htmlFor={`other-${config.subject}-${action.value}`}>
                          <span>{action.label}</span>
                          {action.description && (
                            <span className={styles.otherHint}>{action.description}</span>
                          )}
                        </label>
                      </div>
                      <Marks config={config} rules={rules} actions={[action]} />
                    </li>
                  ))}
                </ul>
                <Muted>{editable ? "Checked actions are allowed everywhere." : reason}</Muted>
              </Stack>
            </PopoverContent>
          </Popover>
          <Marks config={config} rules={rules} actions={actions} />
        </span>
      );
    }
    return (
      <span className={styles.matrixCell}>
        <GrantCheckbox
          config={config}
          actions={actions}
          granted={base}
          disabled={!editable}
          onToggle={(on) =>
            toggle(
              config,
              actions.map((action) => action.value),
              on
            )
          }
        />
        <Marks config={config} rules={rules} actions={actions} />
      </span>
    );
  };

  const columns: AccessColumn<PermissionSubject>[] = [
    {
      id: "subject",
      header: "Policy",
      width: "30%",
      render: (config) => (
        <>
          <span className={styles.matrixTitle}>{config.title}</span>
          {errors?.[config.subject] && (
            <Tooltip content="A rule on this policy needs attention. Edit rules to fix it.">
              <span className={styles.mark} data-tone="forbid">
                <Icon name="alert" size={14} />
              </span>
            </Tooltip>
          )}
        </>
      )
    },
    ...VERBS.map((verb): AccessColumn<PermissionSubject> => ({
      id: verb.id,
      header: verb.label,
      width: verb.id === "other" ? 144 : 104,
      render: (config) => cell(config, verb.id)
    })),
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (config) => {
        const count = draft[config.subject]?.length ?? 0;
        return (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setEditing(config.subject)}
            aria-label={`Edit rules for ${config.title}`}
          >
            {count > 1 ? `${count} rules` : "Rules"}
          </Button>
        );
      }
    }
  ];

  return (
    <Stack gap={12}>
      <div className={styles.layoutToolbar}>
        <Tabs
          variant="segmented"
          label="Policies shown"
          value={show}
          onChange={(value) => setShow(value as "granted" | "all")}
          tabs={[
            { value: "granted", label: "Granted", count: granted.length },
            { value: "all", label: "All policies", count: subjects.length }
          ]}
        />
        <div className={styles.grow}>
          <Input
            icon="search"
            placeholder="Search policies..."
            aria-label="Search policies"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <AccessTable
        label="Permission matrix"
        rows={rows}
        columns={columns}
        getRowId={(config) => config.subject}
        rowLabel={(config) => config.title}
        empty={
          <EmptyState
            size="sm"
            icon="lock"
            title={query ? "No policies match" : "No policies granted"}
            description={
              query
                ? "Try another policy name."
                : "Switch to All policies and check the actions this role needs."
            }
            actions={
              !query && (
                <Button variant="outline" onClick={() => setShow("all")}>
                  Show all policies
                </Button>
              )
            }
          />
        }
      />
      <ul className={styles.legend} aria-label="Matrix legend">
        <li>
          <span className={styles.matrixCheck} aria-hidden>
            <Checkbox checked disabled tabIndex={-1} />
          </span>
          Allowed everywhere
        </li>
        <li>
          <span className={styles.matrixCheck} aria-hidden>
            <Checkbox checked="indeterminate" disabled tabIndex={-1} />
          </span>
          Some actions in the column allowed everywhere
        </li>
        <li>
          <span className={styles.mark} data-tone="conditional" aria-hidden>
            <Icon icon={FilterIcon} size={14} />
          </span>
          Allowed only where conditions match
        </li>
        <li>
          <span className={styles.mark} data-tone="forbid" aria-hidden>
            <Icon icon={BanIcon} size={14} />
          </span>
          Forbidden, overrides allow
        </li>
      </ul>
      <SubjectRulesSheet
        props={props}
        config={subjects.find((subject) => subject.subject === editing)}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
    </Stack>
  );
};
