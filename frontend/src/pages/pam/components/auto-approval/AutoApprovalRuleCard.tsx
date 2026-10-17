import { Fragment } from "react";
import { Plus, ShieldAlert, Trash2, X } from "lucide-react";

import {
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
  findSubject,
  getConditionError,
  getRuleError,
  getUnboundInputSubjects,
  newKey,
  TAutoApprovalDraft,
  TDraftCondition,
  TDraftRule
} from "./autoApprovalDraft";
import { DisabledReason, SectionLabel } from "./AutoApprovalLabels";
import { AutoApprovalValuePicker } from "./AutoApprovalValuePicker";

type TSubjectChoice = {
  key: string;
  connectionId: string;
  subject: string;
  label: string;
  via: string;
};

type Props = {
  index: number;
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
  condition,
  rule,
  catalog,
  policyType,
  scope,
  scopeId,
  showErrors,
  onChange,
  onRemove
}: {
  condition: TDraftCondition;
  rule: TDraftRule;
  catalog: TAutoApprovalCatalogConnection[];
  policyType: ApprovalPolicyType;
  scope: ApprovalPolicyScope;
  scopeId: string;
  showErrors: boolean;
  onChange: (condition: TDraftCondition) => void;
  onRemove: () => void;
}) => {
  const { subject } = findSubject(catalog, condition.connectionId, condition.subject);
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
    <div className="flex flex-col gap-1 py-1.5 pr-1.5 pl-2.5">
      <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant="neutral">{subject?.label ?? "Unavailable record"}</Badge>
        <span className="text-sm text-foreground">{constraint?.label ?? condition.constraint}</span>
        {constraint && constraint.value !== AutoApprovalConstraintValue.None && (
          <div className="max-w-72 min-w-40 flex-1">
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
      {error && <p className="px-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
};

export const AutoApprovalRuleCard = ({
  index,
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
  const choices = getSubjectChoices(inputs, catalog);
  const ruleError = showErrors ? getRuleError(rule, catalog) : null;
  const unbound = getUnboundInputSubjects(rule, catalog);

  // Each check appears once per rule, so the menu only offers the ones not added yet
  const menuGroups = choices
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
    addConditionBlocker = "Add a field under Request Information first, so rules can check it.";
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
        <span className="shrink-0 text-sm text-muted">Rule {index + 1}</span>
        <input
          value={rule.name}
          onChange={(e) => onChange({ ...rule, name: e.target.value })}
          placeholder="Name this rule"
          aria-label="Rule name"
          maxLength={128}
          className={cn(
            "-mx-1 min-w-0 flex-1 rounded-sm bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-muted hover:bg-foreground/5 focus:bg-foreground/5",
            showErrors && !rule.name.trim() && "placeholder:text-danger"
          )}
        />
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Remove rule"
          className="text-muted hover:text-danger"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>

      <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-x-6 gap-y-5 p-4">
        <SectionLabel>When</SectionLabel>
        <p className="text-sm text-foreground">The request is submitted</p>

        <SectionLabel>Conditions</SectionLabel>
        <div className="flex flex-col items-start gap-2">
          {rule.conditions.length > 0 && (
            <div className="flex w-full flex-col divide-y divide-border rounded-md border border-border">
              {rule.conditions.map((condition) => (
                <ConditionRow
                  key={condition.key}
                  condition={condition}
                  rule={rule}
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

          {unbound.map((condition) => {
            const { subject } = findSubject(catalog, condition.connectionId, condition.subject);
            return (
              <div
                key={`${condition.connectionId}:${condition.subject}`}
                className="flex max-w-full items-center gap-2 rounded-md border border-warning/20 bg-warning/5 px-2.5 py-1.5 text-xs"
              >
                <ShieldAlert className="size-3.5 shrink-0 text-warning" />
                <span className="text-muted">
                  Anyone could link someone else&apos;s {subject?.label ?? "record"}.
                </span>
                <Button
                  type="button"
                  variant="text"
                  size="xs"
                  className="shrink-0 font-medium"
                  onClick={() =>
                    addCondition({
                      connectionId: condition.connectionId,
                      subject: condition.subject,
                      constraint: ASSIGNED_TO_REQUESTER_CONSTRAINT
                    })
                  }
                >
                  Add assignee check
                </Button>
              </div>
            );
          })}

          <DisabledReason reason={addConditionBlocker}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={Boolean(addConditionBlocker)}>
                <Button type="button" variant="ghost" size="sm" className="-ml-2.5">
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
