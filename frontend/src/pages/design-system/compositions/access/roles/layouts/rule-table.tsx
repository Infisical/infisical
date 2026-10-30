import { useMemo, useState } from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";

import { type AccessColumn, AccessTable } from "../../table";
import { FabDock, Gate, ListToolbar, Muted } from "../../ui";
import type { PermissionSubject } from "../catalog";
import { ConditionsFields } from "../conditions";
import { emptyRule, type Rule, ruleId, validatePermissions } from "../permissions-model";
import { visibleActions } from "../policies";
import { actionsText, conditionsText } from "../rule-summary";
import type { LayoutProps } from "./shared";

import styles from "../roles.module.css";

type Row = { key: string; config: PermissionSubject; index: number; rule: Rule };
type Editing = { subject: string; index?: number; rule: Rule };

const RuleSheet = ({
  props,
  editing,
  onClose
}: {
  props: LayoutProps;
  editing?: Editing;
  onClose: () => void;
}) => {
  const { scope, subjects, editable, reason, draft, onChange } = props;
  const [subject, setSubject] = useState(editing?.subject ?? subjects[0]?.subject);
  const [rule, setRule] = useState<Rule>(editing?.rule ?? emptyRule());
  const [errors, setErrors] = useState<ReturnType<typeof validatePermissions>[string][number]>();
  const config = subjects.find((item) => item.subject === subject);
  if (!editing || !config) return null;
  const conditional = scope === "project" && Boolean(config.conditional);
  const isNew = editing.index === undefined;
  const save = () => {
    const found = validatePermissions(scope, { [config.subject]: [rule] })[config.subject]?.[0];
    if (found) {
      setErrors(found);
      return;
    }
    const current = draft[config.subject] ?? [];
    const sameSubject = editing.subject === config.subject;
    const moved = { ...draft };
    if (!isNew && !sameSubject) {
      const left = (draft[editing.subject] ?? []).filter((_, i) => i !== editing.index);
      if (left.length) moved[editing.subject] = left;
      else delete moved[editing.subject];
    }
    moved[config.subject] =
      !isNew && sameSubject
        ? current.map((item, i) => (i === editing.index ? rule : item))
        : [...current, rule];
    onChange(moved);
    onClose();
  };
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>{isNew ? "Add rule" : "Edit rule"}</SheetTitle>
          <SheetDescription>
            A rule allows or forbids actions on one policy, optionally only where its conditions
            match.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Stack gap={16}>
            <div className={styles.ruleSheetRow}>
              <Field label="Policy">
                <Select
                  label="Policy"
                  value={config.subject}
                  disabled={!editable}
                  options={subjects.map((item) => ({ value: item.subject, label: item.title }))}
                  onChange={(value) => {
                    setSubject(value);
                    setRule((current) => ({ ...current, actions: [], conditions: [] }));
                    setErrors(undefined);
                  }}
                />
              </Field>
              <Field label="Effect">
                <Gate
                  allowed={conditional}
                  reason="This policy does not support Forbid rules or conditions"
                >
                  <Select
                    label="Effect"
                    value={String(rule.inverted)}
                    disabled={!editable || !conditional}
                    options={[
                      { value: "false", label: "Allow" },
                      { value: "true", label: "Forbid" }
                    ]}
                    onChange={(value) => setRule({ ...rule, inverted: value === "true" })}
                  />
                </Gate>
              </Field>
            </div>
            <Field label="Actions" error={errors?.actions} wide>
              <Combobox
                multiple
                clearable
                label="Actions"
                placeholder="Select actions..."
                emptyText="No permission actions found."
                disabled={!editable}
                invalid={Boolean(errors?.actions)}
                options={visibleActions(scope, config, rule).map((action) => ({
                  value: action.value,
                  label: action.label,
                  meta: action.description
                }))}
                value={rule.actions}
                onChange={(actions) => setRule({ ...rule, actions })}
              />
            </Field>
            {conditional ? (
              <ConditionsFields
                subject={config.subject}
                scopeLabel={config.title}
                actions={rule.actions}
                conditions={rule.conditions}
                disabled={!editable}
                reason={reason}
                errors={errors?.conditions}
                onChange={(conditions) => setRule({ ...rule, conditions })}
              />
            ) : (
              <Muted>This policy applies everywhere in the project; it has no conditions.</Muted>
            )}
          </Stack>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Gate allowed={editable} reason={reason}>
              <Button variant="primary" disabled={!editable} onClick={save}>
                {isNew ? "Add rule" : "Save rule"}
              </Button>
            </Gate>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export const RuleTable = (props: LayoutProps) => {
  const { scope, draft, subjects, editable, reason, errors, onChange } = props;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Editing>();
  const rows = useMemo<Row[]>(() => {
    const needle = search.trim().toLowerCase();
    return subjects.flatMap((config) =>
      (draft[config.subject] ?? [])
        .map((rule, index) => ({ key: `${config.subject}:${rule.id}`, config, index, rule }))
        .filter(
          (row) =>
            (!filter.length || filter.includes(config.subject)) &&
            [
              config.title,
              actionsText(scope, config.subject, row.rule.actions),
              conditionsText(config.subject, row.rule.conditions)
            ].some((value) => value.toLowerCase().includes(needle))
        )
    );
  }, [subjects, draft, search, filter, scope]);

  const removeRows = (keys: string[]) => {
    const next = { ...draft };
    subjects.forEach((config) => {
      const kept = (draft[config.subject] ?? []).filter(
        (rule) => !keys.includes(`${config.subject}:${rule.id}`)
      );
      if (kept.length) next[config.subject] = kept;
      else delete next[config.subject];
    });
    onChange(next);
    setSelected([]);
  };

  const columns: AccessColumn<Row>[] = [
    {
      id: "effect",
      header: "Effect",
      width: 96,
      render: (row) =>
        row.rule.inverted ? <Badge tone="bad">Forbid</Badge> : <Badge tone="soft">Allow</Badge>
    },
    {
      id: "policy",
      header: "Policy",
      width: "22%",
      render: (row) => (
        <>
          <span>{row.config.title}</span>
          {errors?.[row.config.subject]?.[row.index] && <Badge tone="bad">Needs attention</Badge>}
        </>
      )
    },
    {
      id: "actions-text",
      header: "Actions",
      render: (row) =>
        row.rule.actions.length ? (
          <span title={actionsText(scope, row.config.subject, row.rule.actions)}>
            {actionsText(scope, row.config.subject, row.rule.actions)}
          </span>
        ) : (
          <Muted>No actions</Muted>
        )
    },
    {
      id: "where",
      header: "Where",
      width: "30%",
      render: (row) =>
        row.rule.conditions.length ? (
          <span title={conditionsText(row.config.subject, row.rule.conditions)}>
            {conditionsText(row.config.subject, row.rule.conditions)}
          </span>
        ) : (
          <Muted>Everywhere</Muted>
        )
    },
    {
      id: "menu",
      header: "Actions",
      actions: true,
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {`Actions for ${row.config.title} rule`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                setEditing({ subject: row.config.subject, index: row.index, rule: row.rule })
              }
            >
              <Icon name="settings" />
              {editable ? "Edit rule" : "View rule"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!editable}
              description={editable ? undefined : reason}
              onSelect={() =>
                onChange({
                  ...draft,
                  [row.config.subject]: [
                    ...(draft[row.config.subject] ?? []),
                    { ...structuredClone(row.rule), id: ruleId() }
                  ]
                })
              }
            >
              <Icon name="copy" />
              Duplicate rule
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!editable}
              description={editable ? undefined : reason}
              onSelect={() => removeRows([row.key])}
            >
              <Icon name="trash" />
              Delete rule
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  const policyCount = subjects.filter((config) => draft[config.subject]?.length).length;
  return (
    <Stack gap={12}>
      <div className={styles.layoutToolbar}>
        <div className={styles.grow}>
          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search rules by policy, action or condition..."
            filter={{
              label: "Filter by policy",
              options: subjects
                .filter((config) => draft[config.subject]?.length)
                .map((config) => ({ value: config.subject, label: config.title })),
              selected: filter,
              onToggle: (value) =>
                setFilter((current) =>
                  current.includes(value)
                    ? current.filter((item) => item !== value)
                    : [...current, value]
                )
            }}
          />
        </div>
        <Gate allowed={editable} reason={reason}>
          <Button
            variant="outline"
            icon="plus"
            disabled={!editable}
            onClick={() => setEditing({ subject: subjects[0].subject, rule: emptyRule() })}
          >
            Add rule
          </Button>
        </Gate>
      </div>
      <AccessTable
        label="Role rules"
        rows={rows}
        columns={columns}
        getRowId={(row) => row.key}
        rowLabel={(row) => `${row.config.title} rule`}
        onRowClick={(row) =>
          setEditing({ subject: row.config.subject, index: row.index, rule: row.rule })
        }
        selection={{
          selected,
          onChange: setSelected,
          blockedReason: () => (editable ? undefined : reason)
        }}
        empty={
          <EmptyState
            size="sm"
            icon="lock"
            title={search || filter.length ? "No rules match" : "No rules yet"}
            description={
              search || filter.length
                ? "Adjust your search or policy filter."
                : "Add a rule to grant this role access."
            }
          />
        }
      />
      <p className={styles.legend}>
        {`${rows.length} rules across ${policyCount} policies. Rules on the same policy combine with or; a Forbid wins over an Allow.`}
      </p>
      <FabDock active={selected.length > 0}>
        <FloatingActionBar
          placement="contained"
          label="Selected rule actions"
          count={selected.length}
          total={rows.length}
          onSelectAll={() => setSelected(rows.map((row) => row.key))}
          onClear={() => setSelected([])}
          noun={selected.length === 1 ? "rule" : "rules"}
          actions={[
            {
              label: "Delete",
              icon: "trash",
              danger: true,
              disabled: !editable,
              onClick: () => removeRows(selected)
            }
          ]}
        />
      </FabDock>
      {editing && (
        <RuleSheet
          key={`${editing.subject}:${editing.index ?? "new"}`}
          props={props}
          editing={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </Stack>
  );
};
