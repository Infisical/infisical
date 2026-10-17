import { useQuery } from "@tanstack/react-query";
import { Info, Link2, Plus, X } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  ProviderIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  approvalPolicyQuery,
  ApprovalPolicyScope,
  ApprovalPolicyType
} from "@app/hooks/api/approvalPolicies";

import { findSubject, newKey, TAutoApprovalDraft } from "./autoApprovalDraft";
import { DisabledReason, SectionLabel } from "./AutoApprovalLabels";
import { AutoApprovalRuleCard } from "./AutoApprovalRuleCard";

type Props = {
  policyType: ApprovalPolicyType;
  scope: ApprovalPolicyScope;
  scopeId: string;
  draft: TAutoApprovalDraft;
  onChange: (draft: TAutoApprovalDraft) => void;
  showErrors: boolean;
  hasApprovers: boolean;
};

const ConnectionIcon = ({ app }: { app: string }) => {
  const details = APP_CONNECTION_MAP[app as AppConnection];
  if (!details) return null;
  return <ProviderIcon icon={details.image} alt="" className="size-4 shrink-0" />;
};

export const AutoApprovalCard = ({
  policyType,
  scope,
  scopeId,
  draft,
  onChange,
  showErrors,
  hasApprovers
}: Props) => {
  const { data: catalog = [], isPending } = useQuery(
    approvalPolicyQuery.autoApprovalCatalog({ policyType, scope, scopeId })
  );

  const availableInputs = catalog.flatMap((connection) =>
    connection.subjects
      .filter(
        (subject) =>
          subject.input &&
          !draft.inputs.some(
            (input) => input.connectionId === connection.id && input.subject === subject.id
          )
      )
      .map((subject) => ({ connection, subject }))
  );

  const removeInput = (connectionId: string, subject: string) =>
    onChange({
      inputs: draft.inputs.filter(
        (input) => !(input.connectionId === connectionId && input.subject === subject)
      ),
      // A condition cannot check information the request no longer asks for
      rules: draft.rules.map((rule) => ({
        ...rule,
        conditions: rule.conditions.filter(
          (condition) => !(condition.connectionId === connectionId && condition.subject === subject)
        )
      }))
    });

  const addRule = () =>
    onChange({
      ...draft,
      rules: [
        ...draft.rules,
        { key: newKey(), name: `Rule ${draft.rules.length + 1}`, conditions: [] }
      ]
    });

  let addInputBlocker: string | undefined;
  if (catalog.length === 0) {
    addInputBlocker = "Add an app connection that supports auto-approval.";
  } else if (availableInputs.length === 0) {
    addInputBlocker = "Every available field is already added.";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          Auto-Approval
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3.5 text-muted" aria-label="When auto-approval applies" />
            </TooltipTrigger>
            <TooltipContent className="max-w-72">
              Only applies to accounts whose template has Allow Auto-Approval on. Requests no rule
              approves wait for the approvers below.
            </TooltipContent>
          </Tooltip>
        </CardTitle>
        <CardDescription>
          Automatically approve requests that meet specific conditions, using what requesters
          provide.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <SectionLabel>Request Information</SectionLabel>
                  <p className="text-sm text-muted">
                    Records requesters link when asking for access.
                  </p>
                </div>
                <DisabledReason reason={addInputBlocker}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild disabled={Boolean(addInputBlocker)}>
                      <Button type="button" variant="outline" size="sm" className="border-dashed">
                        <Plus />
                        Add Field
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {availableInputs.map(({ connection, subject }) => (
                        <DropdownMenuItem
                          key={`${connection.id}:${subject.id}`}
                          onClick={() =>
                            onChange({
                              ...draft,
                              inputs: [
                                ...draft.inputs,
                                { connectionId: connection.id, subject: subject.id }
                              ]
                            })
                          }
                        >
                          <ConnectionIcon app={connection.app} />
                          {subject.input?.label}
                          <span className="text-muted">· {connection.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </DisabledReason>
              </div>

              {draft.inputs.length > 0 && (
                <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                  {draft.inputs.map((input) => {
                    const { connection, subject } = findSubject(
                      catalog,
                      input.connectionId,
                      input.subject
                    );
                    return (
                      <div
                        key={`${input.connectionId}:${input.subject}`}
                        className="flex items-center gap-3 px-4 py-2.5"
                      >
                        <span className="text-sm text-foreground">
                          {subject?.input?.label ?? input.subject}
                        </span>
                        {connection ? (
                          <Badge variant="neutral">
                            <Link2 />
                            {connection.name}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted">
                            Connection unavailable. You may not have access to it.
                          </span>
                        )}
                        <Badge variant="outline" className="ml-auto">
                          Optional
                        </Badge>
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label="Remove field"
                          className="text-muted hover:text-danger"
                          onClick={() => removeInput(input.connectionId, input.subject)}
                        >
                          <X className="size-4" />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <SectionLabel>Rules</SectionLabel>
                <DisabledReason
                  reason={
                    hasApprovers
                      ? undefined
                      : "Add an approver first. Requests no rule approves still need someone to approve them."
                  }
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-dashed"
                    isDisabled={!hasApprovers}
                    onClick={addRule}
                  >
                    <Plus />
                    Add Rule
                  </Button>
                </DisabledReason>
              </div>

              {draft.rules.map((rule, index) => (
                <AutoApprovalRuleCard
                  key={rule.key}
                  index={index}
                  rule={rule}
                  inputs={draft.inputs}
                  catalog={catalog}
                  policyType={policyType}
                  scope={scope}
                  scopeId={scopeId}
                  showErrors={showErrors}
                  onChange={(next) =>
                    onChange({
                      ...draft,
                      rules: draft.rules.map((candidate) =>
                        candidate.key === next.key ? next : candidate
                      )
                    })
                  }
                  onRemove={() =>
                    onChange({
                      ...draft,
                      rules: draft.rules.filter((candidate) => candidate.key !== rule.key)
                    })
                  }
                />
              ))}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
};
