import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, Combobox, TextArea } from "@app/components/v3";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  approvalPolicyQuery,
  TAutoApprovalAiContextConnection,
  TAutoApprovalCatalog
} from "@app/hooks/api/approvalPolicies";
import { useOrgConnectionCreation } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { AUTO_APPROVAL_LIMITS, TDraftCondition } from "./autoApprovalDraft";
import { ConnectionIcon } from "./AutoApprovalLabels";

type Props = {
  condition: TDraftCondition;
  ai: TAutoApprovalCatalog["ai"];
  isError: boolean;
  onChange: (condition: TDraftCondition) => void;
};

export const AutoApprovalAiCondition = ({ condition, ai, isError, onChange }: Props) => {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<TAutoApprovalAiContextConnection[]>([]);
  const contextIds = condition.contextConnectionIds ?? [];

  const options = [
    ...ai.contextConnections,
    ...created.filter(
      (connection) => !ai.contextConnections.some((option) => option.id === connection.id)
    )
  ];
  const selected = contextIds.flatMap((id) => options.find((option) => option.id === id) ?? []);

  // Jira is the only app with AI lookups so far; the picker offers to create one inline
  const creation = useOrgConnectionCreation<TAutoApprovalAiContextConnection>(
    AppConnection.Jira,
    (connection) => {
      setCreated((previous) => [
        ...previous,
        { id: connection.id, name: connection.name, app: connection.app, tools: [] }
      ]);
      onChange({ ...condition, contextConnectionIds: [...contextIds, connection.id] });
      queryClient.invalidateQueries({ queryKey: approvalPolicyQuery.allKey() });
    }
  );

  return (
    <div className="flex flex-col gap-4 pt-1 pb-1">
      <div className="flex flex-col gap-1">
        <p className="px-1.5 text-xs font-medium text-foreground">Instructions</p>
        <TextArea
          aria-label="AI instructions"
          value={condition.prompt ?? ""}
          onChange={(e) => onChange({ ...condition, prompt: e.target.value })}
          placeholder="Approve if the linked Jira ticket is an open incident assigned to the requester."
          maxLength={AUTO_APPROVAL_LIMITS.aiPromptLength}
          isError={isError}
          rows={3}
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="px-1.5 text-xs font-medium text-foreground">Additional Context</p>
        <Combobox
          multiple
          isClearable={false}
          aria-label="Additional context"
          size="sm"
          options={options}
          value={selected}
          onValueChange={(next) =>
            onChange({
              ...condition,
              contextConnectionIds: next
                .slice(0, AUTO_APPROVAL_LIMITS.aiContextConnections)
                .map((option) => option.id)
            })
          }
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          renderOption={(option) => (
            <span className="flex items-center gap-2">
              <ConnectionIcon app={option.app} />
              {option.name}
            </span>
          )}
          placeholder="Connections the AI can read from..."
          emptyMessage="No connections the AI can read from."
          creation={
            contextIds.length < AUTO_APPROVAL_LIMITS.aiContextConnections ? creation : undefined
          }
        />
        <p className="px-1.5 text-xs text-muted">
          The AI can only read from these connections, for example to look up a Jira ticket.
        </p>
      </div>
      <Alert variant="warning" className="py-1.5">
        <TriangleAlert />
        <AlertDescription className="text-xs">
          The requester writes the reason and the request form fields, and can try to give the AI
          instructions in them. Keep the is assigned to the requester and hasn&apos;t been used
          before checks in this rule.
        </AlertDescription>
      </Alert>
    </div>
  );
};
