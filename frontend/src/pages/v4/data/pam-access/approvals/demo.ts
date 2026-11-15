import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AutoApprovalConstraintValue,
  type TAutoApprovalCatalog,
  type TAutoApprovalInputDetails,
  type TAutoApprovalInputValue,
  type TAutoApprovalOption,
  type TAutoApprovalOutcome
} from "@app/hooks/api/approvalPolicies";
import { PamApproverType, PamNotificationEvent, type TPamApprovalConfig } from "@app/hooks/api/pam";

import { createFixtureStore } from "../../fixture-store";
import { accessRequestStore } from "../../pam/demo";
import type { PamAccessApprovalsAdapter } from "./contract";

const JIRA_CONNECTION_ID = "c0000000-0000-4000-8000-000000000001";
const DEMO_FOLDER_ID = "f0000000-0000-4000-8000-000000000001";

const catalog: TAutoApprovalCatalog = {
  apps: [AppConnection.Jira],
  connections: [
    {
      id: JIRA_CONNECTION_ID,
      name: "jira-acme",
      app: AppConnection.Jira,
      subjects: [
        {
          id: "issue",
          label: "Jira issue",
          input: { label: "Jira issue", placeholder: "OPS-123" },
          constraints: [
            {
              id: "not-used-before",
              label: "has not been used before",
              value: AutoApprovalConstraintValue.None,
              hasOptions: false
            },
            {
              id: "assigned-to-requester",
              label: "is assigned to the requester",
              value: AutoApprovalConstraintValue.None,
              hasOptions: false
            },
            {
              id: "project-is",
              label: "is in project",
              value: AutoApprovalConstraintValue.One,
              hasOptions: true
            },
            {
              id: "status-in",
              label: "has status",
              value: AutoApprovalConstraintValue.Many,
              hasOptions: true
            }
          ]
        },
        {
          id: AUTO_APPROVAL_REQUESTER_SUBJECT,
          label: "Requester",
          input: null,
          constraints: [
            {
              id: "in-group",
              label: "is in Jira group",
              value: AutoApprovalConstraintValue.Many,
              hasOptions: true
            }
          ]
        }
      ]
    }
  ]
};

const OPTIONS: Record<string, TAutoApprovalOption[]> = {
  "project-is": [
    { value: "OPS", label: "Operations (OPS)" },
    { value: "SEC", label: "Security (SEC)" },
    { value: "INC", label: "Incidents (INC)" }
  ],
  "status-in": ["To Do", "In Progress", "In Review", "Done"].map((label) => ({
    value: label,
    label
  })),
  "in-group": ["on-call", "database-admins", "sre"].map((label) => ({ value: label, label }))
};

const emptyConfig: TPamApprovalConfig = {
  steps: [],
  notificationConfigs: [],
  breakGlassUsers: [],
  autoApproval: { inputs: [], rules: [] }
};

const configStore = createFixtureStore<Record<string, TPamApprovalConfig>>({
  [DEMO_FOLDER_ID]: {
    steps: [
      {
        approvers: [
          { type: PamApproverType.User, id: "u-sarah" },
          { type: PamApproverType.Group, id: "g-platform" }
        ]
      }
    ],
    notificationConfigs: [
      {
        id: "nc-1",
        integration: "slack",
        integrationSlug: "acme-slack",
        workflowIntegrationId: "wi-1",
        channels: [{ id: "ch-1", name: "pam-access" }],
        events: [PamNotificationEvent.AccessRequested, PamNotificationEvent.AccessRequestBypassed]
      }
    ],
    breakGlassUsers: [{ type: PamApproverType.User, id: "u-marcus" }],
    autoApproval: {
      inputs: [{ id: "in-1", connectionId: JIRA_CONNECTION_ID, subject: "issue" }],
      rules: [
        {
          id: "rule-1",
          name: "On-call incident",
          conditions: [
            {
              id: "cond-1",
              connectionId: JIRA_CONNECTION_ID,
              subject: "issue",
              constraint: "not-used-before",
              values: []
            },
            {
              id: "cond-2",
              connectionId: JIRA_CONNECTION_ID,
              subject: "issue",
              constraint: "assigned-to-requester",
              values: []
            },
            {
              id: "cond-3",
              connectionId: JIRA_CONNECTION_ID,
              subject: "issue",
              constraint: "project-is",
              values: ["INC"]
            }
          ]
        }
      ]
    }
  }
});

const subjectOf = (connectionId: string, subject: string) => {
  const connection = catalog.connections.find(({ id }) => id === connectionId);
  return { connection, entry: connection?.subjects.find(({ id }) => id === subject) };
};

const inputsFor = (config: TPamApprovalConfig | undefined): TAutoApprovalInputDetails[] =>
  (config?.autoApproval?.inputs ?? []).flatMap(({ connectionId, subject }) => {
    const { connection, entry } = subjectOf(connectionId, subject);
    if (!connection || !entry?.input) return [];
    return [{ connectionId, connectionName: connection.name, subject, ...entry.input }];
  });

export const useDemoAutoApprovalInputs = (folderId: string | undefined) => {
  const configs = configStore.use();
  return folderId ? inputsFor(configs[folderId]) : [];
};

const conditionPasses = (
  condition: { connectionId: string; subject: string; constraint: string; values: string[] },
  submitted: TAutoApprovalInputValue[]
) => {
  if (condition.subject === AUTO_APPROVAL_REQUESTER_SUBJECT) return true;
  const value = submitted.find(
    ({ connectionId, subject }) =>
      connectionId === condition.connectionId && subject === condition.subject
  )?.value;
  if (!value) return false;
  if (condition.constraint === "project-is")
    return condition.values.some((project) => value.toUpperCase().startsWith(`${project}-`));
  if (condition.constraint === "not-used-before")
    return !accessRequestStore
      .get()
      .some((request) => request.autoApproval?.inputs.some((input) => input.value === value));
  return true;
};

export const evaluateDemoAutoApproval = (
  folderId: string,
  submitted: TAutoApprovalInputValue[]
): TAutoApprovalOutcome | null => {
  const config = configStore.get()[folderId];
  const rules = config?.autoApproval?.rules ?? [];
  if (!rules.length || !submitted.length) return null;
  const evaluated = rules.map((rule) => {
    const conditions = rule.conditions.map((condition) => {
      const passed = conditionPasses(condition, submitted);
      const { entry } = subjectOf(condition.connectionId, condition.subject);
      const constraint = entry?.constraints.find(({ id }) => id === condition.constraint);
      return {
        id: condition.id,
        description: `${entry?.label ?? condition.subject} ${constraint?.label ?? condition.constraint}`,
        passed,
        reason: passed ? null : "The submitted value did not match"
      };
    });
    return {
      id: rule.id,
      name: rule.name,
      passed: conditions.every(({ passed }) => passed),
      conditions
    };
  });
  const approvedBy = evaluated.find(({ passed }) => passed);
  return {
    approvedAt: approvedBy ? new Date().toISOString() : null,
    approvedByRuleId: approvedBy?.id ?? null,
    inputs: submitted.map(({ connectionId, subject, value }) => ({
      label: subjectOf(connectionId, subject).entry?.input?.label ?? subject,
      value,
      url: null
    })),
    rules: evaluated
  };
};

export const pamAccessApprovalsDemo: PamAccessApprovalsAdapter = {
  useApprovalConfig: (folderId) => {
    const configs = configStore.use();
    return {
      data: folderId ? (configs[folderId] ?? emptyConfig) : undefined,
      isPending: false,
      error: null
    };
  },
  useSetApprovalConfig: () => ({
    isPending: false,
    mutateAsync: async ({
      folderId,
      steps,
      breakGlassUsers,
      notificationConfigs,
      autoApproval
    }) => {
      configStore.update((all) => {
        const current = all[folderId] ?? emptyConfig;
        return {
          ...all,
          [folderId]: {
            steps,
            breakGlassUsers: breakGlassUsers ?? current.breakGlassUsers,
            notificationConfigs: notificationConfigs
              ? current.notificationConfigs.filter((saved) =>
                  notificationConfigs.some(
                    (kept) => kept.workflowIntegrationId === saved.workflowIntegrationId
                  )
                )
              : current.notificationConfigs,
            autoApproval: autoApproval
              ? {
                  inputs: autoApproval.inputs.map((input, index) => ({
                    ...input,
                    id: `in-${index}`
                  })),
                  rules: autoApproval.rules.map((rule, index) => ({
                    id: `rule-${index}`,
                    name: rule.name,
                    conditions: rule.conditions.map((condition, position) => ({
                      ...condition,
                      id: `cond-${index}-${position}`
                    }))
                  }))
                }
              : current.autoApproval
          }
        };
      });
      return {};
    }
  }),
  useFolderAccessRequests: (params) => {
    const all = accessRequestStore.use();
    const matching = all.filter(
      (request) =>
        request.requestData?.requestData.folderId === params?.folderId &&
        (!params?.status || request.status === params.status)
    );
    const offset = params?.offset ?? 0;
    return {
      data: {
        requests: matching.slice(offset, offset + (params?.limit ?? matching.length)),
        totalCount: matching.length
      },
      isPending: false,
      error: null
    };
  },
  useAutoApprovalCatalog: () => ({
    data: catalog,
    isPending: false,
    error: null,
    refetch: async () => catalog
  }),
  useAutoApprovalOptions: (params, enabled) => {
    const search = params.search?.toLowerCase() ?? "";
    return {
      data: enabled
        ? (OPTIONS[params.constraint] ?? []).filter(({ label }) =>
            label.toLowerCase().includes(search)
          )
        : [],
      isPending: false,
      error: null
    };
  }
};
