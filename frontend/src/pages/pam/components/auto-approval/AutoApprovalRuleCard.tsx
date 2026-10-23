import { Fragment, useId } from "react";
import { Pencil, Plus, ShieldAlert, X } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AutoApprovalConstraintValue,
  TAutoApprovalCatalogConnection
} from "@app/hooks/api/approvalPolicies";

import {
  ASSIGNED_TO_REQUESTER_CONSTRAINT,
  AUTO_APPROVAL_LIMITS,
  findSubject,
  getConditionError,
  getRecordKind,
  getRuleError,
  getSubjectDisplayLabel,
  getSubjectsMissingCheck,
  newKey,
  TAutoApprovalDraft,
  TDraftCondition,
  TDraftRule,
  UNUSED_CONSTRAINT
} from "./autoApprovalDraft";
import { ConnectionIcon, DisabledReason, SectionLabel } from "./AutoApprovalLabels";
import { AutoApprovalValuePicker } from "./AutoApprovalValuePicker";

type TSubjectChoice = {
  key: string;
  connectionId: string;
  subject: string;
  label: string;
  via: string;
};

type Props = {
  rule: TDraftRule;
  inputs: TAutoApprovalDraft["inputs"];
  catalog: TAutoApprovalCatalogConnection[];
  policyType: ApprovalPolicyType;
  scope: ApprovalPolicyScope;
  scopeId: string;
  showErrors: boolean;
  onChange: (rule: TDraftRule) => void;
  onRemove: () => void;
};

const getSubjectChoices = (
  inputs: TAutoApprovalDraft["inputs"],
  catalog: TAutoApprovalCatalogConnection[]
): TSubjectChoice[] => {
  const fromInputs = inputs.flatMap(({ connectionId, subject: subjectId }) => {
    const { connection, subject } = findSubject(catalog, connectionId, subjectId);
    if (!connection || !subject) return [];
    return [
      {
        key: `${connectionId}:${subjectId}`,
        connectionId,
        subject: subjectId,
        label: subject.label,
        via: connection.name
      }
    ];
  });

  const fromRequester = catalog.flatMap((connection) =>
    connection.subjects
      .filter((subject) => subject.id === AUTO_APPROVAL_REQUESTER_SUBJECT)
      .map((subject) => ({
        key: `${connection.id}:${subject.id}`,
        connectionId: connection.id,
        subject: subject.id,
        label: subject.label,
        via: connection.name
      }))
  );

  return [...fromInputs, ...fromRequester];
};

const ConditionRow = ({
  showConnector,
  condition,
  rule,
  inputs,
  catalog,
  policyType,
  scope,
  scopeId,
  showErrors,
  onChange,
  onRemove
}: {
  showConnector: boolean;
  condition: TDraftCondition;
  rule: TDraftRule;
  inputs: TAutoApprovalDraft["inputs"];
  catalog: TAutoApprovalCatalogConnection[];
  policyType: ApprovalPolicyType;
  scope: ApprovalPolicyScope;
  scopeId: string;
  showErrors: boolean;
  onChange: (condition: TDraftCondition) => void;
  onRemove: () => void;
}) => {
  const { connection, subject } = findSubject(catalog, condition.connectionId, condition.subject);
  const subjectLabel = getSubjectDisplayLabel(
    inputs,
    catalog,
    condition.connectionId,
    condition.subject
  );
  const constraint = subject?.constraints.find(
    (candidate) => candidate.id === condition.constraint
  );
  const error = showErrors ? getConditionError(condition, catalog) : null;

  // Other conditions on the same subject narrow this one's options, like statuses for a picked project
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
    <div className="relative flex flex-col gap-1 py-1.5 pr-1.5 pl-2.5">
      {showConnector && (
        <span className="absolute top-0 left-4 -translate-y-1/2 bg-card px-1 text-[10px] leading-none font-medium tracking-wider text-muted uppercase">
          and
        </span>
      )}
      <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant="neutral">
          {connection && <ConnectionIcon app={connection.app} className="size-3.5" />}
          {subjectLabel ?? "Unavailable record"}
        </Badge>
        <span className="text-sm text-foreground">{constraint?.label ?? condition.constraint}</span>
        {constraint?.value === AutoApprovalConstraintValue.Many && (
          <span className="text-xs text-muted">one of</span>
        )}
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Remove condition"
          className="ml-auto text-muted hover:text-danger"
          onClick={onRemove}
        >
          <X className="size-4" />
        </IconButton>
      </div>
      {constraint && constraint.value !== AutoApprovalConstraintValue.None && (
        <div className="pb-1">
          <AutoApprovalValuePicker
            policyType={policyType}
            scope={scope}
            scopeId={scopeId}
            connectionId={condition.connectionId}
            subject={condition.subject}
            constraint={constraint}
            values={condition.values}
            siblings={siblings}
            onChange={(values) => onChange({ ...condition, values })}
            isError={Boolean(error)}
          />
        </div>
      )}
      {error && <p className="px-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
};

export const AutoApprovalRuleCard = ({
  rule,
  inputs,
  catalog,
  policyType,
  scope,
  scopeId,
  showErrors,
  onChange,
  onRemove
}: Props) => {
  const nameInputId = useId();
  const choices = getSubjectChoices(inputs, catalog);
  const ruleError = showErrors ? getRuleError(rule) : null;
  const missingChecks = [
    ...getSubjectsMissingCheck(rule, catalog, ASSIGNED_TO_REQUESTER_CONSTRAINT).map(
      (condition) => ({
        condition,
        constraint: ASSIGNED_TO_REQUESTER_CONSTRAINT,
        message: (label: string) => `Anyone could link someone else's ${label}.`,
        action: "Add assignee check"
      })
    ),
    ...getSubjectsMissingCheck(rule, catalog, UNUSED_CONSTRAINT).map((condition) => ({
      condition,
      constraint: UNUSED_CONSTRAINT,
      message: (label: string) => `The same ${label} can be reused for any number of requests.`,
      action: "Add reuse check"
    }))
  ];

  const connectionIdByKind = new Map(
    rule.conditions.map((condition) => [
      getRecordKind(catalog, condition.connectionId, condition.subject),
      condition.connectionId
    ])
  );

  // Each check appears once per rule, and a field kind comes from one connection, so the menu skips both
  const menuGroups = choices
    .filter((choice) => {
      const usedConnectionId = connectionIdByKind.get(
        getRecordKind(catalog, choice.connectionId, choice.subject)
      );
      return !usedConnectionId || usedConnectionId === choice.connectionId;
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
    .filter((group) => group.constraints.length > 0);

  let addConditionBlocker: string | undefined;
  if (choices.length === 0) {
    addConditionBlocker = "Add a field under Request Form Fields first.";
  } else if (rule.conditions.length >= AUTO_APPROVAL_LIMITS.conditions) {
    addConditionBlocker = `A rule can have at most ${AUTO_APPROVAL_LIMITS.conditions} conditions.`;
  } else if (menuGroups.length === 0) {
    addConditionBlocker = "Every available check is already in this rule.";
  }

  const updateCondition = (next: TDraftCondition) =>
    onChange({
      ...rule,
      conditions: rule.conditions.map((condition) =>
        condition.key === next.key ? next : condition
      )
    });

  const addCondition = (condition: Omit<TDraftCondition, "key" | "values">) =>
    onChange({
      ...rule,
      conditions: [...rule.conditions, { key: newKey(), values: [], ...condition }]
    });

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <label
          htmlFor={nameInputId}
          className="group -mx-1.5 flex min-w-0 flex-1 cursor-text items-center gap-2 rounded-sm px-1.5 py-0.5 focus-within:bg-foreground/5 hover:bg-foreground/5"
        >
          <Pencil className="size-3.5 shrink-0 text-muted group-focus-within:text-foreground group-hover:text-foreground" />
          <input
            id={nameInputId}
            value={rule.name}
            onChange={(e) => onChange({ ...rule, name: e.target.value })}
            placeholder="Name this rule"
            aria-label="Rule name"
            aria-invalid={showErrors && !rule.name.trim()}
            maxLength={128}
            className={cn(
              "min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted",
              showErrors && !rule.name.trim() && "placeholder:text-danger"
            )}
          />
        </label>
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Remove rule"
          className="text-muted hover:text-danger"
          onClick={onRemove}
        >
          <X className="size-4" />
        </IconButton>
      </div>

      <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-x-6 gap-y-5 p-4">
        <SectionLabel>When</SectionLabel>
        <p className="text-sm text-foreground">The request is submitted</p>

        <SectionLabel>Conditions</SectionLabel>
        <div className="flex flex-col items-start gap-2">
          {rule.conditions.length > 0 && (
            <div className="flex w-full flex-col divide-y divide-border rounded-md border border-border">
              {rule.conditions.map((condition, conditionIndex) => (
                <ConditionRow
                  key={condition.key}
                  showConnector={conditionIndex > 0}
                  condition={condition}
                  rule={rule}
                  inputs={inputs}
                  catalog={catalog}
                  policyType={policyType}
                  scope={scope}
                  scopeId={scopeId}
                  showErrors={showErrors}
                  onChange={updateCondition}
                  onRemove={() =>
                    onChange({
                      ...rule,
                      conditions: rule.conditions.filter(
                        (candidate) => candidate.key !== condition.key
                      )
                    })
                  }
                />
              ))}
            </div>
          )}

          {missingChecks.map(({ condition, constraint, message, action }) => {
            const subjectLabel = getSubjectDisplayLabel(
              inputs,
              catalog,
              condition.connectionId,
              condition.subject
            );
            return (
              <Alert
                key={`${condition.connectionId}:${condition.subject}:${constraint}`}
                variant="warning"
                className="py-1.5"
              >
                <ShieldAlert />
                <AlertDescription className="text-xs">
                  <span>{message(subjectLabel ?? "record")}</span>
                  <AlertAction>
                    <Button
                      type="button"
                      variant="warning"
                      size="xs"
                      className="h-6"
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
                  </AlertAction>
                </AlertDescription>
              </Alert>
            );
          })}

          <DisabledReason reason={addConditionBlocker}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={Boolean(addConditionBlocker)}>
                <Button type="button" variant="ghost" size="sm">
                  <Plus />
                  Add Condition
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {menuGroups.map(({ choice, constraints }, groupIndex) => (
                  <Fragment key={choice.key}>
                    {groupIndex > 0 && <DropdownMenuSeparator />}
                    {menuGroups.length > 1 && (
                      <DropdownMenuLabel>
                        {choice.label} · {choice.via}
                      </DropdownMenuLabel>
                    )}
                    {constraints.map((constraint) => (
                      <DropdownMenuItem
                        key={constraint.id}
                        onClick={() =>
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
                  </Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </DisabledReason>

          {ruleError && <p className="text-xs text-danger">{ruleError}</p>}
        </div>

        <SectionLabel>Then</SectionLabel>
        <p className="text-sm text-foreground">Approve automatically</p>
      </div>
    </div>
  );
};
