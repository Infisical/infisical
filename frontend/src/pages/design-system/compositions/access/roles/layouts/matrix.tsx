import { useMemo, useState } from "react";
import { InfoIcon } from "lucide-react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { EmptyState } from "@app/components/v4/ui/empty";
import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Tabs } from "@app/components/v4/ui/tabs";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { type AccessColumn, AccessTable } from "../../table";
import { FabDock, Muted } from "../../ui";
import type { PermissionSubject } from "../catalog";
import { ruleId } from "../permissions-model";
import { matrixActions, subjectState, VERBS, verbOf } from "../rule-summary";
import { type LayoutProps, setRules, SubjectRulesSheet } from "./shared";

import styles from "../roles.module.css";

export const PermissionMatrix = (props: LayoutProps) => {
  const { draft, subjects, editable, reason, errors, onChange } = props;
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"granted" | "all">("granted");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | undefined>(props.initialSubject);
  const granted = subjects.filter((subject) => draft[subject.subject]?.length);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (show === "granted" ? granted : subjects).filter((subject) =>
      [subject.title, subject.description].some((value) => value.toLowerCase().includes(needle))
    );
  }, [query, show, granted, subjects]);

  const setAllowed = (config: PermissionSubject, actions: string[]) => {
    const current = draft[config.subject]?.[0];
    onChange(
      setRules(
        draft,
        config.subject,
        actions.length
          ? [{ id: current?.id ?? ruleId(), inverted: false, conditions: [], actions }]
          : undefined
      )
    );
  };

  const verbCell = (config: PermissionSubject, verb: (typeof VERBS)[number]["id"]) => {
    const actions = matrixActions(config).filter((action) => verbOf(action.value) === verb);
    if (!actions.length) return <Muted>-</Muted>;
    const state = subjectState(draft[config.subject]);
    const values = actions.map((action) => action.value);
    const anyRule = (draft[config.subject] ?? []).some((rule) =>
      rule.actions.some((action) => values.includes(action))
    );
    if (!state.simple) {
      return anyRule ? (
        <Tooltip content="Set by a rule with conditions or a Forbid. Edit the rules to change it.">
          <span className={styles.matrixMark}>
            <Icon name="check" size={14} />
          </span>
        </Tooltip>
      ) : (
        <Muted>-</Muted>
      );
    }
    if (verb === "other") {
      const on = values.filter((value) => state.allowed.includes(value)).length;
      return (
        <Button variant="ghost" size="xs" onClick={() => setEditing(config.subject)}>
          {`${on} of ${values.length}`}
        </Button>
      );
    }
    const on = values.filter((value) => state.allowed.includes(value));
    const label = actions.map((action) => action.label).join(", ");
    return (
      <Tooltip content={label}>
        <span className={styles.matrixCheck}>
          <Checkbox
            aria-label={`${label} for ${config.title}`}
            disabled={!editable}
            checked={on.length === values.length || (on.length > 0 && "indeterminate")}
            onCheckedChange={() =>
              setAllowed(
                config,
                on.length === values.length
                  ? state.allowed.filter((value) => !values.includes(value))
                  : [...new Set([...state.allowed, ...values])]
              )
            }
          />
        </span>
      </Tooltip>
    );
  };

  const columns: AccessColumn<PermissionSubject>[] = [
    {
      id: "subject",
      header: "Policy",
      width: "34%",
      render: (config) => {
        const state = subjectState(draft[config.subject]);
        return (
          <>
            <span className={styles.matrixTitle}>{config.title}</span>
            {state.forbid && <Badge tone="bad">Forbid</Badge>}
            {state.conditional && <Badge tone="soft">Conditional</Badge>}
            {state.ruleCount > 1 && <Badge tone="outline">{`${state.ruleCount} rules`}</Badge>}
            {errors?.[config.subject] && <Badge tone="bad">Needs attention</Badge>}
          </>
        );
      }
    },
    ...VERBS.map((verb): AccessColumn<PermissionSubject> => ({
      id: verb.id,
      header: verb.label,
      width: verb.id === "other" ? 112 : 88,
      render: (config) => verbCell(config, verb.id)
    })),
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (config) => (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setEditing(config.subject)}
          aria-label={`Edit rules for ${config.title}`}
        >
          Rules
        </Button>
      )
    }
  ];

  const selectedSubjects = subjects.filter((subject) => selected.includes(subject.subject));
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
        selection={{
          selected,
          onChange: setSelected,
          blockedReason: () => (editable ? undefined : reason)
        }}
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
      <p className={styles.legend}>
        <Icon icon={InfoIcon} size={12} />
        Checkboxes grant unconditional access. Rows with conditions or a Forbid open their rules to
        edit.
      </p>
      <FabDock active={selected.length > 0}>
        <FloatingActionBar
          placement="contained"
          label="Selected policy actions"
          count={selected.length}
          total={rows.length}
          onSelectAll={() => setSelected(rows.map((row) => row.subject))}
          onClear={() => setSelected([])}
          noun={selected.length === 1 ? "policy" : "policies"}
          actions={[
            {
              label: "Grant view",
              icon: "eye",
              disabled: !editable,
              onClick: () => {
                let next = draft;
                selectedSubjects.forEach((config) => {
                  const state = subjectState(next[config.subject]);
                  if (!state.simple) return;
                  const view = matrixActions(config)
                    .filter((action) => verbOf(action.value) === "view")
                    .map((action) => action.value);
                  const actions = [...new Set([...state.allowed, ...view])];
                  next = setRules(next, config.subject, [
                    {
                      id: next[config.subject]?.[0]?.id ?? ruleId(),
                      inverted: false,
                      conditions: [],
                      actions
                    }
                  ]);
                });
                onChange(next);
                setSelected([]);
              }
            },
            {
              label: "Remove access",
              icon: "trash",
              danger: true,
              disabled: !editable,
              onClick: () => {
                let next = draft;
                selectedSubjects.forEach((config) => {
                  next = setRules(next, config.subject, undefined);
                });
                onChange(next);
                setSelected([]);
              }
            }
          ]}
        />
      </FabDock>
      <SubjectRulesSheet
        props={props}
        config={subjects.find((subject) => subject.subject === editing)}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
    </Stack>
  );
};
