import { useMemo, useState } from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { List, ListRow, ListSection } from "@app/components/v4/ui/list";

import { Gate } from "../../ui";
import type { PermissionSubject } from "../catalog";
import { emptyRule } from "../permissions-model";
import { RuleList, SubjectActions } from "../policies";
import { subjectState } from "../rule-summary";
import { type LayoutProps, setRules } from "./shared";

import styles from "../roles.module.css";

const rowMeta = (props: LayoutProps, config: PermissionSubject) => {
  const state = subjectState(props.draft[config.subject]);
  if (!state.ruleCount) return undefined;
  return (
    <span className={styles.rowBadges}>
      {props.errors?.[config.subject] && <Badge tone="bad">Needs attention</Badge>}
      {state.forbid && <Badge tone="bad">Forbid</Badge>}
      {state.conditional && <Badge tone="soft">Conditional</Badge>}
      <Badge tone="outline">{state.ruleCount === 1 ? "1 rule" : `${state.ruleCount} rules`}</Badge>
    </span>
  );
};

export const MasterDetail = (props: LayoutProps) => {
  const { scope, draft, subjects, editable, reason, errors, onChange } = props;
  const granted = subjects.filter((subject) => draft[subject.subject]?.length);
  const [current, setCurrent] = useState(
    props.initialSubject ?? granted[0]?.subject ?? subjects[0]?.subject
  );
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = (config: PermissionSubject) => config.title.toLowerCase().includes(needle);
  const others = useMemo(
    () => subjects.filter((subject) => !draft[subject.subject]?.length),
    [subjects, draft]
  );
  const config = subjects.find((subject) => subject.subject === current);
  const rules = config ? (draft[config.subject] ?? []) : [];

  const row = (item: PermissionSubject) => (
    <ListRow
      key={item.subject}
      value={item.subject}
      label={item.title}
      title={item.title}
      meta={rowMeta(props, item)}
      current={item.subject === current}
      onClick={() => setCurrent(item.subject)}
    />
  );

  return (
    <div className={styles.masterDetail}>
      <Stack gap={8}>
        <Input
          icon="search"
          placeholder="Search policies..."
          aria-label="Search policies"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.masterList} data-scroll-fade="y">
          <List label="Policies" size="sm" empty="No policies match">
            {granted.filter(matches).length > 0 && (
              <ListSection label="Granted" meta={String(granted.length)}>
                {granted.filter(matches).map(row)}
              </ListSection>
            )}
            {others.filter(matches).length > 0 && (
              <ListSection label="Not granted" meta={String(others.length)}>
                {others.filter(matches).map(row)}
              </ListSection>
            )}
          </List>
        </div>
      </Stack>
      <section className={styles.detailPane} aria-label={config?.title ?? "Policy"}>
        {config ? (
          <>
            <header className={styles.detailHead}>
              <div className={styles.panelCopy}>
                <h4 className={styles.panelTitle}>{config.title}</h4>
                <p className={styles.muted}>{config.description}</p>
              </div>
              <div className={styles.cardActions}>
                {rules.length > 0 && (
                  <SubjectActions
                    scope={scope}
                    config={config}
                    disabled={!editable}
                    reason={reason}
                    onAddRule={() =>
                      onChange(setRules(draft, config.subject, [...rules, emptyRule()]))
                    }
                  />
                )}
                {rules.length > 0 && (
                  <Gate allowed={editable} reason={reason}>
                    <Button
                      variant="outline"
                      size="xs"
                      icon="trash"
                      disabled={!editable}
                      onClick={() => onChange(setRules(draft, config.subject, undefined))}
                    >
                      Remove access
                    </Button>
                  </Gate>
                )}
              </div>
            </header>
            {rules.length ? (
              <RuleList
                scope={scope}
                config={config}
                rules={rules}
                disabled={!editable}
                reason={reason}
                errors={errors?.[config.subject]}
                onChange={(next) => onChange(setRules(draft, config.subject, next))}
                onRemovePolicy={() => onChange(setRules(draft, config.subject, undefined))}
              />
            ) : (
              <EmptyState
                size="sm"
                icon="lock"
                title="This role has no access here"
                description={`Grant access to choose which ${config.title.toLowerCase()} actions this role can take.`}
                actions={
                  <Gate allowed={editable} reason={reason}>
                    <Button
                      variant="outline"
                      icon="plus"
                      disabled={!editable}
                      onClick={() => onChange(setRules(draft, config.subject, [emptyRule()]))}
                    >
                      Grant access
                    </Button>
                  </Gate>
                }
              />
            )}
          </>
        ) : (
          <EmptyState size="sm" icon="lock" title="Select a policy" />
        )}
      </section>
    </div>
  );
};
