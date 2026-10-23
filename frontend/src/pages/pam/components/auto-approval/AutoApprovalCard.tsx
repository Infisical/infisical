import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Plus, TriangleAlert, X } from "lucide-react";

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
  FieldContent,
  FieldDescription,
  FieldTitle,
  IconButton,
  ProviderIcon
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  approvalPolicyQuery,
  ApprovalPolicyScope,
  ApprovalPolicyType
} from "@app/hooks/api/approvalPolicies";

import {
  AUTO_APPROVAL_LIMITS,
  findSubject,
  getDefaultRuleConditions,
  newKey,
  TAutoApprovalDraft
} from "./autoApprovalDraft";
import { DisabledReason, LogicConnector } from "./AutoApprovalLabels";
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
  const {
    data: catalog = [],
    isPending,
    isError,
    isFetching,
    refetch
  } = useQuery(approvalPolicyQuery.autoApprovalCatalog({ policyType, scope, scopeId }));

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
        {
          key: newKey(),
          name: `Rule ${draft.rules.length + 1}`,
          conditions: getDefaultRuleConditions(draft.inputs, catalog)
        }
      ]
    });

  const addRuleBlocker =
    draft.rules.length >= AUTO_APPROVAL_LIMITS.rules
      ? `A folder can have at most ${AUTO_APPROVAL_LIMITS.rules} rules.`
      : undefined;

  let addInputBlocker: string | undefined;
  if (catalog.length === 0) {
    addInputBlocker = "Add an app connection that supports auto-approval.";
  } else if (draft.inputs.length >= AUTO_APPROVAL_LIMITS.inputs) {
    addInputBlocker = `A folder can have at most ${AUTO_APPROVAL_LIMITS.inputs} request form fields.`;
  } else if (availableInputs.length === 0) {
    addInputBlocker = "Every available field is already added.";
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Auto-Approval</CardTitle>
        <CardDescription>
          Requests that pass a rule are approved automatically if the account&apos;s template allows
          auto-approval. Other requests wait for the approvers below.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {isPending && <Skeleton className="h-24 w-full" />}
        {isError && (
          <div className="flex flex-col items-center gap-3 rounded-md border border-border p-8 text-center text-sm text-muted">
            Couldn&apos;t load the app connections auto-approval can use.
            <Button
              type="button"
              variant="outline"
              size="sm"
              isPending={isFetching}
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </div>
        )}
        {!isPending && !isError && (
          <>
            <section className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <FieldContent>
                  <FieldTitle>Request Form Fields</FieldTitle>
                  <FieldDescription>
                    Optional fields on the access request form, such as a Jira ticket. Rules check
                    what requesters enter.
                  </FieldDescription>
                </FieldContent>
                <DisabledReason reason={addInputBlocker}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild disabled={Boolean(addInputBlocker)}>
                      <Button type="button" variant="outline" size="sm">
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

              {draft.inputs.length === 0 ? (
                <div className="rounded-md border border-border p-8 text-center text-sm text-muted">
                  No request form fields added. Rules have nothing to check until you add one.
                </div>
              ) : (
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
                <FieldTitle>Rules</FieldTitle>
                <DisabledReason reason={addRuleBlocker}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isDisabled={Boolean(addRuleBlocker)}
                    onClick={addRule}
                  >
                    <Plus />
                    Add Rule
                  </Button>
                </DisabledReason>
              </div>

              {!hasApprovers && draft.rules.length > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-warning/20 bg-warning/5 px-2.5 py-1.5 text-xs text-foreground/80">
                  <TriangleAlert className="size-3.5 shrink-0 text-warning" />
                  This folder has no approvers. Access requests that don&apos;t pass an
                  auto-approval rule are rejected immediately.
                </div>
              )}

              {draft.rules.length === 0 ? (
                <div className="rounded-md border border-border p-8 text-center text-sm text-muted">
                  No rules added. Every request waits for the approvers below.
                </div>
              ) : (
                <div className="flex flex-col">
                  {draft.rules.map((rule, index) => (
                    <Fragment key={rule.key}>
                      {index > 0 && <LogicConnector label="or" />}
                      <AutoApprovalRuleCard
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
                    </Fragment>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
};
