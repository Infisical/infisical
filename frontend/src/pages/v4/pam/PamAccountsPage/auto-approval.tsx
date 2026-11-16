import { type Dispatch, type SetStateAction, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Combobox } from "@infisical/cipher/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Item } from "@infisical/cipher/ui/item";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Heading, Meta, SmallText, StatusText } from "@infisical/cipher/ui/text";

import {
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";
import {
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AutoApprovalConstraintValue,
  type TAutoApprovalCatalogConnection,
  type TAutoApprovalCatalogConstraint
} from "@app/hooks/api/approvalPolicies";

import { useOrgPermission } from "../../access/permissions";
import { errorMessage } from "../../access/toast";
import { connectionCreation } from "../../components/app-connection-form";
import { ProviderIcon } from "../../components/provider-icon";
import { useV4Adapter } from "../../data/adapters";
import { INLINE_CONNECTION_PRESETS } from "../../data/integrations/connection-presets";
import {
  ASSIGNED_TO_REQUESTER_CONSTRAINT,
  AUTO_APPROVAL_LIMITS,
  conditionError,
  defaultRuleConditions,
  findSubject,
  type folderAutoApprovalScope,
  newKey,
  recordKind,
  ruleError,
  subjectDisplayLabel,
  subjectsMissingCheck,
  type TAutoApprovalDraft,
  type TDraftCondition,
  type TDraftRule,
  UNUSED_CONSTRAINT
} from "./auto-approval-draft";

type Scope = ReturnType<typeof folderAutoApprovalScope>;

const ConnectionIcon = ({ app }: { app: string }) => {
  const details = APP_CONNECTION_MAP[app as AppConnection];
  return details ? <ProviderIcon icon={details.image} alt={details.name} size="sm" /> : null;
};

const ValuePicker = ({
  scope,
  connectionId,
  subject,
  constraint,
  values,
  siblings,
  invalid,
  onChange
}: {
  scope: Scope;
  connectionId: string;
  subject: string;
  constraint: TAutoApprovalCatalogConstraint;
  values: string[];
  siblings: Record<string, string[]>;
  invalid: boolean;
  onChange: (values: string[]) => void;
}) => {
  const [search, setSearch] = useState("");
  const isMany = constraint.value === AutoApprovalConstraintValue.Many;
  const { data: fetched = [], isPending } = useV4Adapter("pamAccess").useAutoApprovalOptions(
    {
      ...scope,
      connectionId,
      subject,
      constraint: constraint.id,
      search: isMany ? undefined : search.trim(),
      siblings
    },
    constraint.hasOptions
  );
  const options = [
    ...fetched,
    ...values
      .filter((value) => !fetched.some((option) => option.value === value))
      .map((value) => ({ value, label: value }))
  ];
  const create = (input: string) => {
    const value = input.trim();
    if (!value || values.includes(value)) return;
    onChange(isMany ? [...values, value] : [value]);
  };

  if (isMany)
    return (
      <MultiSelect
        label={constraint.label}
        size="sm"
        searchable
        invalid={invalid}
        options={options}
        value={values}
        onChange={onChange}
        onCreate={create}
        createLabel={(query) => `Use "${query.trim()}"`}
        placeholder="Choose values..."
      />
    );

  return (
    <Combobox
      label={constraint.label}
      invalid={invalid}
      options={options}
      value={values[0] ?? ""}
      onChange={(value) => onChange(value ? [value] : [])}
      onSearch={setSearch}
      loading={constraint.hasOptions && isPending}
      onCreate={create}
      createLabel={(query) => `Use "${query.trim()}"`}
      emptyText="No matches. Type a value to use it."
      placeholder="Choose a value..."
    />
  );
};

const ConditionRow = ({
  condition,
  rule,
  inputs,
  catalog,
  scope,
  showErrors,
  onChange,
  onRemove
}: {
  condition: TDraftCondition;
  rule: TDraftRule;
  inputs: TAutoApprovalDraft["inputs"];
  catalog: TAutoApprovalCatalogConnection[];
  scope: Scope;
  showErrors: boolean;
  onChange: (condition: TDraftCondition) => void;
  onRemove: () => void;
}) => {
  const { connection, subject } = findSubject(catalog, condition.connectionId, condition.subject);
  const constraint = subject?.constraints.find(({ id }) => id === condition.constraint);
  const error = showErrors ? conditionError(condition, catalog) : null;
  const siblings = Object.fromEntries(
    rule.conditions
      .filter(
        (other) =>
          other.key !== condition.key &&
          other.connectionId === condition.connectionId &&
          other.subject === condition.subject &&
          other.values.length > 0
      )
      .map((other) => [other.constraint, other.values])
  );

  return (
    <Item
      variant="outline"
      size="sm"
      media={connection && <ConnectionIcon app={connection.app} />}
      title={
        <Inline gap={8} align="center">
          <span>
            {subjectDisplayLabel(inputs, catalog, condition.connectionId, condition.subject) ??
              "Unavailable record"}
          </span>
          <Meta mono={false}>
            {constraint?.label ?? condition.constraint}
            {constraint?.value === AutoApprovalConstraintValue.Many && " one of"}
          </Meta>
        </Inline>
      }
      error={error ?? undefined}
      actions={
        <Button
          variant="ghost"
          size="icon-xs"
          icon="x"
          iconOnly
          aria-label="Remove condition"
          onClick={onRemove}
        />
      }
    >
      {constraint && constraint.value !== AutoApprovalConstraintValue.None && (
        <ValuePicker
          scope={scope}
          connectionId={condition.connectionId}
          subject={condition.subject}
          constraint={constraint}
          values={condition.values}
          siblings={siblings}
          invalid={Boolean(error)}
          onChange={(values) => onChange({ ...condition, values })}
        />
      )}
    </Item>
  );
};

const RuleCard = ({
  rule,
  inputs,
  catalog,
  scope,
  showErrors,
  onChange,
  onRemove
}: {
  rule: TDraftRule;
  inputs: TAutoApprovalDraft["inputs"];
  catalog: TAutoApprovalCatalogConnection[];
  scope: Scope;
  showErrors: boolean;
  onChange: (rule: TDraftRule) => void;
  onRemove: () => void;
}) => {
  const choices = [
    ...inputs.flatMap(({ connectionId, subject: subjectId }) => {
      const { connection, subject } = findSubject(catalog, connectionId, subjectId);
      return connection && subject
        ? [{ connectionId, subject: subjectId, label: subject.label, via: connection.name }]
        : [];
    }),
    ...catalog.flatMap((connection) =>
      connection.subjects
        .filter(({ id }) => id === AUTO_APPROVAL_REQUESTER_SUBJECT)
        .map((subject) => ({
          connectionId: connection.id,
          subject: subject.id,
          label: subject.label,
          via: connection.name
        }))
    )
  ];
  const error = showErrors ? ruleError(rule) : null;
  const missingChecks = [
    ...subjectsMissingCheck(rule, catalog, ASSIGNED_TO_REQUESTER_CONSTRAINT).map((condition) => ({
      condition,
      constraint: ASSIGNED_TO_REQUESTER_CONSTRAINT,
      message: (label: string) => `Anyone could link someone else's ${label}.`,
      action: "Add assignee check"
    })),
    ...subjectsMissingCheck(rule, catalog, UNUSED_CONSTRAINT).map((condition) => ({
      condition,
      constraint: UNUSED_CONSTRAINT,
      message: (label: string) => `The same ${label} can be reused for any number of requests.`,
      action: "Add reuse check"
    }))
  ];
  const connectionByKind = new Map(
    rule.conditions.map((condition) => [
      recordKind(catalog, condition.connectionId, condition.subject),
      condition.connectionId
    ])
  );
  const menuGroups = choices
    .filter((choice) => {
      const used = connectionByKind.get(recordKind(catalog, choice.connectionId, choice.subject));
      return !used || used === choice.connectionId;
    })
    .map((choice) => ({
      choice,
      constraints:
        findSubject(catalog, choice.connectionId, choice.subject).subject?.constraints.filter(
          (constraint) =>
            !rule.conditions.some(
              (condition) =>
                condition.connectionId === choice.connectionId &&
                condition.subject === choice.subject &&
                condition.constraint === constraint.id
            )
        ) ?? []
    }))
    .filter(({ constraints }) => constraints.length > 0);

  let addBlocker: string | undefined;
  if (choices.length === 0) addBlocker = "Add a request form field first";
  else if (rule.conditions.length >= AUTO_APPROVAL_LIMITS.conditions)
    addBlocker = `A rule can have at most ${AUTO_APPROVAL_LIMITS.conditions} conditions`;
  else if (menuGroups.length === 0) addBlocker = "Every available check is already in this rule";

  const addCondition = (condition: Omit<TDraftCondition, "key" | "values">) =>
    onChange({
      ...rule,
      conditions: [...rule.conditions, { key: newKey(), values: [], ...condition }]
    });

  return (
    <Card
      variant="framed"
      size="sm"
      title={
        <Input
          size="sm"
          aria-label="Rule name"
          placeholder="Name this rule"
          maxLength={128}
          invalid={showErrors && !rule.name.trim()}
          value={rule.name}
          onChange={(event) => onChange({ ...rule, name: event.target.value })}
        />
      }
      action={
        <Button
          variant="ghost"
          size="icon-xs"
          icon="trash"
          iconOnly
          aria-label="Remove rule"
          onClick={onRemove}
        />
      }
    >
      <Stack gap={12}>
        <SmallText muted>
          When a request is submitted and every condition passes, approve it.
        </SmallText>
        {rule.conditions.map((condition) => (
          <ConditionRow
            key={condition.key}
            condition={condition}
            rule={rule}
            inputs={inputs}
            catalog={catalog}
            scope={scope}
            showErrors={showErrors}
            onChange={(next) =>
              onChange({
                ...rule,
                conditions: rule.conditions.map((entry) => (entry.key === next.key ? next : entry))
              })
            }
            onRemove={() =>
              onChange({
                ...rule,
                conditions: rule.conditions.filter(({ key }) => key !== condition.key)
              })
            }
          />
        ))}
        {missingChecks.map(({ condition, constraint, message, action }) => (
          <Alert
            key={`${condition.connectionId}:${condition.subject}:${constraint}`}
            tone="warn"
            title={message(
              subjectDisplayLabel(inputs, catalog, condition.connectionId, condition.subject) ??
                "record"
            )}
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  addCondition({
                    connectionId: condition.connectionId,
                    subject: condition.subject,
                    constraint
                  })
                }
              >
                {action}
              </Button>
            }
          />
        ))}
        <Inline gap={12} align="center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={Boolean(addBlocker)}>
              <Button variant="outline" size="sm" icon="plus" disabledReason={addBlocker}>
                Add condition
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {menuGroups.map(({ choice, constraints }, index) => (
                <div key={`${choice.connectionId}:${choice.subject}`}>
                  {index > 0 && <DropdownMenuSeparator />}
                  {menuGroups.length > 1 && (
                    <DropdownMenuLabel>
                      {choice.label} from {choice.via}
                    </DropdownMenuLabel>
                  )}
                  {constraints.map((constraint) => (
                    <DropdownMenuItem
                      key={constraint.id}
                      onSelect={() =>
                        addCondition({
                          connectionId: choice.connectionId,
                          subject: choice.subject,
                          constraint: constraint.id
                        })
                      }
                    >
                      {choice.label} {constraint.label}
                      {constraint.value !== AutoApprovalConstraintValue.None && "..."}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {error && (
            <StatusText tone="bad" icon="alert-c">
              {error}
            </StatusText>
          )}
        </Inline>
      </Stack>
    </Card>
  );
};

const useOrgConnectionCreation = (
  apps: AppConnection[],
  onCreated: (connectionId: string) => void
) => {
  const createConnection = useV4Adapter("integrations").useCreateConnection();
  const { permission, isPending } = useOrgPermission();
  const app = apps.find((candidate) => INLINE_CONNECTION_PRESETS[candidate]);
  const canCreate =
    isPending ||
    permission.can(OrgPermissionAppConnectionActions.Create, OrgPermissionSubjects.AppConnections);
  if (!app) return undefined;
  return connectionCreation({
    preset: INLINE_CONNECTION_PRESETS[app],
    disabledReason: canCreate ? undefined : "Your role doesn't allow creating connections",
    create: async ({ method, name, description, credentials }) => {
      const created = await createConnection
        .mutateAsync({
          app,
          name,
          method: method as TAppConnection["method"],
          credentials: credentials as TAppConnection["credentials"],
          description: (description as string | undefined)?.trim() || null
        } as TCreateAppConnectionDTO)
        .catch((error: unknown) => {
          throw new Error(errorMessage(error));
        });
      onCreated(created.id);
      return created;
    }
  });
};

const RulesSection = ({
  draft,
  catalog,
  scope,
  showErrors,
  hasApprovers,
  onChange
}: {
  draft: TAutoApprovalDraft;
  catalog: TAutoApprovalCatalogConnection[];
  scope: Scope;
  showErrors: boolean;
  hasApprovers: boolean;
  onChange: (draft: TAutoApprovalDraft) => void;
}) => {
  const ruleLimitReached = draft.rules.length >= AUTO_APPROVAL_LIMITS.rules;
  return (
    <Stack gap={12}>
      <Inline gap={12} justify="between" align="center" wrap={false}>
        <Heading level={4} size="subsection">
          Rules
        </Heading>
        <Button
          variant="outline"
          size="sm"
          icon="plus"
          disabledReason={
            ruleLimitReached
              ? `A folder can have at most ${AUTO_APPROVAL_LIMITS.rules} rules`
              : undefined
          }
          onClick={() =>
            onChange({
              ...draft,
              rules: [
                ...draft.rules,
                {
                  key: newKey(),
                  name: `Rule ${draft.rules.length + 1}`,
                  conditions: defaultRuleConditions(draft.inputs, catalog)
                }
              ]
            })
          }
        >
          Add rule
        </Button>
      </Inline>
      {!hasApprovers && draft.rules.length > 0 && (
        <Alert
          tone="warn"
          title="This folder has no approvers. Requests that don't pass a rule are rejected immediately."
        />
      )}
      {draft.rules.length === 0 ? (
        <EmptyState
          size="sm"
          media="bare"
          icon="zap"
          title="No rules"
          description="Every request waits for the approvers below."
        />
      ) : (
        draft.rules.map((rule, index) => (
          <Stack key={rule.key} gap={8}>
            {index > 0 && <Meta mono={false}>or</Meta>}
            <RuleCard
              rule={rule}
              inputs={draft.inputs}
              catalog={catalog}
              scope={scope}
              showErrors={showErrors}
              onChange={(next) =>
                onChange({
                  ...draft,
                  rules: draft.rules.map((entry) => (entry.key === next.key ? next : entry))
                })
              }
              onRemove={() =>
                onChange({ ...draft, rules: draft.rules.filter(({ key }) => key !== rule.key) })
              }
            />
          </Stack>
        ))
      )}
    </Stack>
  );
};

export const AutoApprovalCard = ({
  scope,
  draft,
  onChange,
  showErrors,
  hasApprovers
}: {
  scope: Scope;
  draft: TAutoApprovalDraft;
  onChange: Dispatch<SetStateAction<TAutoApprovalDraft>>;
  showErrors: boolean;
  hasApprovers: boolean;
}) => {
  const { data, isPending, error, refetch } =
    useV4Adapter("pamAccess").useAutoApprovalCatalog(scope);
  const catalog = data?.connections ?? [];

  const addFieldForConnection = async (connectionId: string) => {
    const latestCatalog = await refetch();
    const created = latestCatalog?.connections.find(({ id }) => id === connectionId);
    const subject = created?.subjects.find(({ input }) => input);
    if (!created || !subject) return;
    onChange((latest) =>
      latest.inputs.length >= AUTO_APPROVAL_LIMITS.inputs ||
      latest.inputs.some(
        (input) => input.connectionId === created.id && input.subject === subject.id
      )
        ? latest
        : {
            ...latest,
            inputs: [...latest.inputs, { connectionId: created.id, subject: subject.id }]
          }
    );
  };
  const creation = useOrgConnectionCreation(data?.fieldApps ?? [], (id) => {
    addFieldForConnection(id);
  });

  const availableInputs = catalog.flatMap((connection) =>
    connection.subjects
      .filter(
        (subject) =>
          subject.input &&
          !draft.inputs.some(
            (input) => input.connectionId === connection.id && input.subject === subject.id
          )
      )
      .map((subject) => ({
        value: `${connection.id}:${subject.id}`,
        label: subject.input?.label ?? subject.label,
        meta: connection.name
      }))
  );

  const removeInput = (connectionId: string, subject: string) =>
    onChange({
      inputs: draft.inputs.filter(
        (input) => !(input.connectionId === connectionId && input.subject === subject)
      ),
      rules: draft.rules.map((rule) => ({
        ...rule,
        conditions: rule.conditions.filter(
          (condition) => !(condition.connectionId === connectionId && condition.subject === subject)
        )
      }))
    });

  const inputLimitReached = draft.inputs.length >= AUTO_APPROVAL_LIMITS.inputs;

  let body = <Skeleton height={96} />;
  if (!isPending && error)
    body = (
      <EmptyState
        size="sm"
        icon="alert"
        title="Couldn't load the app connections auto-approval can use"
        actions={
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    );
  if (!isPending && !error)
    body = (
      <Stack gap={24}>
        <Stack gap={12}>
          <Inline gap={12} justify="between" align="center" wrap={false}>
            <Stack gap={2}>
              <Heading level={4} size="subsection">
                Request form fields
              </Heading>
              <SmallText muted>Optional fields on the request form that rules can check.</SmallText>
            </Stack>
            <Combobox
              label="Add request form field"
              width="sm"
              options={availableInputs}
              value=""
              disabled={inputLimitReached}
              creation={inputLimitReached ? undefined : creation}
              emptyText={
                catalog.length === 0
                  ? "No app connections support auto-approval yet"
                  : "Every available field is already added"
              }
              placeholder={
                inputLimitReached ? `At most ${AUTO_APPROVAL_LIMITS.inputs} fields` : "Add field"
              }
              onChange={(value) => {
                const [connectionId, subject] = value.split(":");
                if (connectionId && subject)
                  onChange({ ...draft, inputs: [...draft.inputs, { connectionId, subject }] });
              }}
            />
          </Inline>
          {draft.inputs.length === 0 ? (
            <EmptyState
              size="sm"
              media="bare"
              icon="file-text"
              title="No request form fields"
              description="Rules have nothing to check until you add one."
            />
          ) : (
            draft.inputs.map((input) => {
              const { connection, subject } = findSubject(
                catalog,
                input.connectionId,
                input.subject
              );
              return (
                <Item
                  key={`${input.connectionId}:${input.subject}`}
                  variant="outline"
                  size="sm"
                  media={connection && <ConnectionIcon app={connection.app} />}
                  title={subject?.input?.label ?? input.subject}
                  description={
                    connection?.name ?? "Connection unavailable. You may not have access to it."
                  }
                  badge={<Badge tone="outline">Optional</Badge>}
                  actions={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      icon="x"
                      iconOnly
                      aria-label="Remove field"
                      onClick={() => removeInput(input.connectionId, input.subject)}
                    />
                  }
                />
              );
            })
          )}
        </Stack>
        <RulesSection
          draft={draft}
          catalog={catalog}
          scope={scope}
          showErrors={showErrors}
          hasApprovers={hasApprovers}
          onChange={onChange}
        />
      </Stack>
    );

  return (
    <Card
      title="Auto-approval"
      description="Requests that pass a rule are approved automatically when the account's template allows auto-approval. Others wait for the approvers below."
    >
      {body}
    </Card>
  );
};
