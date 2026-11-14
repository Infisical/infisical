import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TAiServiceFactory } from "@app/services/ai/ai-service";
import { TAiJudgeResult } from "@app/services/ai/ai-types";
import {
  AI_CONTEXT_APPS,
  buildAppConnectionAiTools,
  listAppConnectionAiTools
} from "@app/services/app-connection/app-connection-ai-tools";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { TApprovalActor } from "@app/services/approval-policy/approval-policy-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TApprovalPolicyAutoApprovalDALFactory } from "./auto-approval-dal";
import {
  evaluateAutoApprovalRules,
  getAutoApprovalSubjectKey,
  isAiCondition,
  TAiConditionResult,
  TResolvedAutoApprovalSubject
} from "./auto-approval-fns";
import { AUTO_APPROVAL_APPS, getAutoApprovalProvider } from "./auto-approval-providers";
import {
  AUTO_APPROVAL_AI_CONSTRAINT,
  AUTO_APPROVAL_AI_CONSTRAINT_LABEL,
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AUTO_APPROVAL_UNUSED_CONSTRAINT,
  AUTO_APPROVAL_UNUSED_CONSTRAINT_LABEL,
  AutoApprovalConstraintValue,
  TAutoApprovalConfig,
  TAutoApprovalContext,
  TAutoApprovalEvidence,
  TAutoApprovalInputValue,
  TAutoApprovalPolicyResponse,
  TAutoApprovalProviderDeps,
  TParsedAutoApprovalInput,
  TStoredAutoApproval
} from "./auto-approval-types";

const RESOLVE_TIMEOUT_MS = 20_000;
// Leaves room for the record lookups so the request stays under common 60s proxy timeouts
const AI_EVALUATION_BUDGET_MS = 30_000;
const AI_MIN_REMAINING_MS = 5_000;

const UNUSED_CONSTRAINT = { label: AUTO_APPROVAL_UNUSED_CONSTRAINT_LABEL, value: AutoApprovalConstraintValue.None };

// A subject the requester links offers the reuse check on top of its provider's own checks
const getConstraintDefinition = (
  subject: { input: unknown; constraints: Record<string, { label: string; value: AutoApprovalConstraintValue }> },
  constraintId: string
) =>
  subject.input && constraintId === AUTO_APPROVAL_UNUSED_CONSTRAINT
    ? UNUSED_CONSTRAINT
    : subject.constraints[constraintId];

type TAutoApprovalServiceFactoryDep = {
  approvalPolicyAutoApprovalDAL: TApprovalPolicyAutoApprovalDALFactory;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "find">;
  appConnectionService: Pick<
    TAppConnectionServiceFactory,
    "validateAppConnectionUsageById" | "listAvailableAppConnectionsForUser"
  >;
  aiService: Pick<TAiServiceFactory, "getOrgAiModel" | "runJudge">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "runWithPoolFailover">;
};

export type TAutoApprovalServiceFactory = ReturnType<typeof autoApprovalServiceFactory>;

// Aborts the work on timeout, so a slow service isn't still being called after the result stopped mattering
const withTimeout = async <T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> => {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new BadRequestError({ message }));
          controller.abort();
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const getAppName = (app: string) => APP_CONNECTION_NAME_MAP[app as keyof typeof APP_CONNECTION_NAME_MAP] ?? app;

export const autoApprovalServiceFactory = ({
  approvalPolicyAutoApprovalDAL,
  appConnectionDAL,
  appConnectionService,
  aiService,
  kmsService,
  gatewayV2Service,
  gatewayPoolService
}: TAutoApprovalServiceFactoryDep) => {
  const providerDeps: TAutoApprovalProviderDeps = { gatewayV2Service, gatewayPoolService };

  const $loadConnection = async ({
    connectionId,
    orgId,
    projectId
  }: {
    connectionId: string;
    orgId: string;
    projectId: string;
  }): Promise<TAppConnection | null> => {
    const raw = await appConnectionDAL.findById(connectionId);
    if (!raw || raw.orgId !== orgId || (raw.projectId && raw.projectId !== projectId)) return null;
    return decryptAppConnection(raw, kmsService);
  };

  const validateConfig = async ({
    projectId,
    config,
    actor
  }: {
    projectId: string;
    config: TAutoApprovalConfig;
    actor: TApprovalActor;
  }): Promise<TAutoApprovalConfig> => {
    const connectionIds = [
      ...new Set([
        ...config.inputs.map((input) => input.connectionId),
        ...config.rules.flatMap((rule) =>
          rule.conditions.flatMap((condition) =>
            !isAiCondition(condition) && condition.connectionId ? [condition.connectionId] : []
          )
        )
      ])
    ];
    const contextConnectionIds = [
      ...new Set(
        config.rules.flatMap((rule) =>
          rule.conditions.flatMap((condition) =>
            isAiCondition(condition) ? (condition.contextConnectionIds ?? []) : []
          )
        )
      )
    ];

    if (
      config.rules.some((rule) => rule.conditions.some(isAiCondition)) &&
      !(await aiService.getOrgAiModel(actor.orgId))
    ) {
      throw new BadRequestError({
        message:
          "Set up an AI model under Organization Settings > General before adding an AI check to auto-approval rules."
      });
    }

    for await (const connectionId of contextConnectionIds) {
      await appConnectionService.validateAppConnectionUsageById(
        AI_CONTEXT_APPS,
        { connectionId, projectId },
        actor as OrgServiceActor
      );
    }

    const appByConnectionId = new Map<string, { app: string; name: string }>();
    for await (const connectionId of connectionIds) {
      const connection = await appConnectionService.validateAppConnectionUsageById(
        AUTO_APPROVAL_APPS,
        { connectionId, projectId },
        actor as OrgServiceActor
      );
      appByConnectionId.set(connectionId, { app: connection.app, name: connection.name });
    }

    const getSubject = (connectionId: string, subjectId: string) => {
      const connection = appByConnectionId.get(connectionId);
      const subject = connection ? getAutoApprovalProvider(connection.app)?.subjects[subjectId] : undefined;
      return { connection, subject };
    };

    const inputKeys = new Set<string>();
    config.inputs.forEach((input) => {
      const key = `${input.connectionId}:${input.subject}`;
      const { connection, subject } = getSubject(input.connectionId, input.subject);

      if (!subject?.input) {
        throw new BadRequestError({
          message: `${getAppName(connection?.app ?? "")} connection '${connection?.name ?? input.connectionId}' has no '${input.subject}' to ask requesters for`
        });
      }
      if (inputKeys.has(key)) {
        throw new BadRequestError({
          message: `The ${subject.input.label} field from '${connection?.name}' is added more than once`
        });
      }
      inputKeys.add(key);
    });

    const rules = config.rules.map((rule) => {
      const name = rule.name.trim();
      const connectionIdByKind = new Map<string, string>();

      if (rule.conditions.filter(isAiCondition).length > 1) {
        throw new BadRequestError({
          message: `Rule '${name}' has more than one AI check. Combine their instructions into one.`
        });
      }

      const conditions = rule.conditions.map((condition) => {
        if (isAiCondition(condition)) {
          const check = `AI ${AUTO_APPROVAL_AI_CONSTRAINT_LABEL}`;
          if (condition.connectionId) {
            throw new BadRequestError({
              message: `Rule '${name}': '${check}' doesn't take a connection. Add connections it can read from as context instead.`
            });
          }
          if (condition.constraint !== AUTO_APPROVAL_AI_CONSTRAINT) {
            throw new BadRequestError({
              message: `Rule '${name}' uses '${condition.constraint}', which is not a check on AI. Use: ${AUTO_APPROVAL_AI_CONSTRAINT}`
            });
          }
          if (condition.values.length) {
            throw new BadRequestError({ message: `Rule '${name}': '${check}' takes no values` });
          }
          const prompt = condition.prompt?.trim();
          if (!prompt) {
            throw new BadRequestError({
              message: `Rule '${name}': write the instructions the AI checks requests against`
            });
          }
          return {
            ...condition,
            connectionId: null,
            values: [],
            prompt,
            contextConnectionIds: [...new Set(condition.contextConnectionIds ?? [])]
          };
        }

        if (condition.prompt || condition.contextConnectionIds?.length) {
          throw new BadRequestError({
            message: `Rule '${name}': only AI checks take instructions and context connections`
          });
        }
        if (!condition.connectionId) {
          throw new BadRequestError({
            message: `Rule '${name}' checks '${condition.subject}' without saying which connection to read it from`
          });
        }

        const isRequester = condition.subject === AUTO_APPROVAL_REQUESTER_SUBJECT;
        const { connection, subject } = getSubject(condition.connectionId, condition.subject);
        const connectionName = connection?.name ?? condition.connectionId;

        if (!subject || (isRequester ? subject.input !== null : subject.input === null)) {
          throw new BadRequestError({
            message: `Rule '${name}' checks '${condition.subject}', which ${getAppName(connection?.app ?? "")} connection '${connectionName}' does not offer`
          });
        }
        if (!isRequester && !inputKeys.has(`${condition.connectionId}:${condition.subject}`)) {
          throw new BadRequestError({
            message: `Rule '${name}' checks the ${subject.label} from '${connectionName}'. Add it to the request form fields first.`
          });
        }

        const kind = `${connection?.app}:${condition.subject}`;
        const otherConnectionId = connectionIdByKind.get(kind);
        if (otherConnectionId && otherConnectionId !== condition.connectionId) {
          throw new BadRequestError({
            message: `Rule '${name}' checks the ${subject.label} from both '${appByConnectionId.get(otherConnectionId)?.name ?? otherConnectionId}' and '${connectionName}'. A rule can only check the ${subject.label} from one connection.`
          });
        }
        connectionIdByKind.set(kind, condition.connectionId);

        const constraint = getConstraintDefinition(subject, condition.constraint);
        if (!constraint) {
          throw new BadRequestError({
            message: `Rule '${name}' uses '${condition.constraint}', which is not a check on the ${subject.label}. Use one of: ${Object.keys(
              subject.constraints
            ).join(", ")}`
          });
        }

        const values = [...new Set(condition.values.map((value) => value.trim()).filter(Boolean))];
        const check = `${subject.label} ${constraint.label}`;

        if (constraint.value === AutoApprovalConstraintValue.None && values.length) {
          throw new BadRequestError({ message: `Rule '${name}': '${check}' takes no values` });
        }
        if (constraint.value === AutoApprovalConstraintValue.One && values.length !== 1) {
          throw new BadRequestError({
            message: `Rule '${name}': '${check}' takes exactly one value`
          });
        }
        if (constraint.value === AutoApprovalConstraintValue.Many && values.length === 0) {
          throw new BadRequestError({
            message: `Rule '${name}': '${check}' needs at least one value`
          });
        }

        return { ...condition, values, prompt: null, contextConnectionIds: [] };
      });

      return { name, conditions };
    });

    return { inputs: config.inputs, rules };
  };

  const replaceConfig = (policyId: string, config: TAutoApprovalConfig, tx: Knex) =>
    approvalPolicyAutoApprovalDAL.replaceForPolicy(policyId, config, tx);

  const findByPolicyIds = (policyIds: string[], tx?: Knex) =>
    approvalPolicyAutoApprovalDAL.findByPolicyIds(policyIds, tx);

  const toPolicyResponse = (stored?: TStoredAutoApproval): TAutoApprovalPolicyResponse => ({
    inputs: (stored?.inputs ?? []).map(({ id, connectionId, subject }) => ({ id, connectionId, subject })),
    rules: (stored?.rules ?? []).map((rule) => ({
      id: rule.id,
      name: rule.name,
      conditions: rule.conditions.map(
        ({ id, connectionId, subject, constraint, values, prompt, contextConnectionIds }) => ({
          id,
          connectionId,
          subject,
          constraint,
          values,
          prompt,
          contextConnectionIds
        })
      )
    }))
  });

  // The inputs a request form shows for a policy, labelled by the provider
  const getInputDetails = async (stored: TStoredAutoApproval | undefined) => {
    if (!stored?.inputs.length) return [];

    const connections = await appConnectionDAL.find({ $in: { id: stored.inputs.map((input) => input.connectionId) } });
    const connectionById = new Map(connections.map((connection) => [connection.id, connection]));

    return stored.inputs.flatMap((input) => {
      const connection = connectionById.get(input.connectionId);
      const definition = connection
        ? getAutoApprovalProvider(connection.app)?.subjects[input.subject]?.input
        : undefined;
      if (!connection || !definition) return [];
      return [
        {
          connectionId: input.connectionId,
          connectionName: connection.name,
          subject: input.subject,
          label: definition.label,
          placeholder: definition.placeholder
        }
      ];
    });
  };

  // Rejects a malformed value up front with the provider's format message, before anything is created
  const parseInputValues = async ({
    stored,
    values,
    orgId,
    projectId
  }: {
    stored: TStoredAutoApproval | undefined;
    values: TAutoApprovalInputValue[];
    orgId: string;
    projectId: string;
  }): Promise<TParsedAutoApprovalInput[]> => {
    const provided = values.filter((entry) => entry.value.trim());
    if (!provided.length) return [];

    const seen = new Set<string>();
    const parsed: TParsedAutoApprovalInput[] = [];

    for await (const entry of provided) {
      const key = `${entry.connectionId}:${entry.subject}`;
      const input = stored?.inputs.find(
        (candidate) => candidate.connectionId === entry.connectionId && candidate.subject === entry.subject
      );
      if (!input) {
        throw new BadRequestError({
          message: `This approval policy doesn't ask for '${entry.subject}' from connection '${entry.connectionId}'`
        });
      }
      if (seen.has(key)) {
        throw new BadRequestError({
          message: `'${entry.subject}' from connection '${entry.connectionId}' was provided more than once`
        });
      }
      seen.add(key);

      const connection = await $loadConnection({ connectionId: entry.connectionId, orgId, projectId });
      const definition = connection ? getAutoApprovalProvider(connection.app)?.subjects[entry.subject]?.input : null;
      if (!connection || !definition) {
        throw new BadRequestError({
          message:
            "The connection behind this request form field is no longer available. Ask an admin to update the approval policy."
        });
      }

      const id = definition.parse(entry.value, connection);
      parsed.push({
        inputId: input.id,
        connectionId: entry.connectionId,
        subject: entry.subject,
        label: definition.label,
        value: entry.value.trim(),
        id,
        url: definition.getUrl?.(id, connection) ?? null
      });
    }

    return parsed;
  };

  // Network calls happen here, so callers must not hold a transaction open around it
  const evaluate = async ({
    stored,
    parsedInputs,
    isRecordUsed,
    orgId,
    projectId,
    ctx
  }: {
    stored: TStoredAutoApproval;
    parsedInputs: TParsedAutoApprovalInput[];
    // Whether an earlier approved request on the policy already linked this record
    isRecordUsed: (record: {
      connectionId: string;
      subject: string;
      stableId: string;
      recordId: string;
    }) => Promise<boolean>;
    orgId: string;
    projectId: string;
    ctx: TAutoApprovalContext;
  }): Promise<TAutoApprovalEvidence> => {
    const targets = new Map<
      string,
      { connectionId: string; subject: string; inputId: string | null; constraintIds: Set<string> }
    >();
    stored.rules.forEach((rule) =>
      rule.conditions.forEach((condition) => {
        if (isAiCondition(condition) || !condition.connectionId) return;
        const key = getAutoApprovalSubjectKey(condition);
        const target = targets.get(key) ?? {
          connectionId: condition.connectionId,
          subject: condition.subject,
          inputId: condition.inputId,
          constraintIds: new Set<string>()
        };
        target.constraintIds.add(condition.constraint);
        targets.set(key, target);
      })
    );

    const connections = new Map<string, Promise<TAppConnection | null>>();
    const loadConnection = (connectionId: string) => {
      let connection = connections.get(connectionId);
      if (!connection) {
        connection = $loadConnection({ connectionId, orgId, projectId }).catch((error) => {
          logger.error(error, `Failed to load auto-approval connection [connectionId=${connectionId}]`);
          return null;
        });
        connections.set(connectionId, connection);
      }
      return connection;
    };

    const resolvedEntries = await Promise.all(
      [...targets.entries()].map(
        async ([key, target]): Promise<[string, TResolvedAutoApprovalSubject & typeof target]> => {
          const connection = await loadConnection(target.connectionId);
          const definition = connection
            ? (getAutoApprovalProvider(connection.app)?.subjects[target.subject] ?? null)
            : null;
          const label = definition?.label ?? target.subject;

          if (!connection || !definition) {
            return [
              key,
              {
                ...target,
                label,
                definition,
                facts: null,
                error: "The connection this check uses is no longer available"
              }
            ];
          }

          const parsedInput = target.inputId
            ? parsedInputs.find((input) => input.inputId === target.inputId)
            : undefined;
          if (target.inputId && !parsedInput) {
            return [
              key,
              {
                ...target,
                label,
                definition,
                facts: null,
                error: `No ${definition.input?.label ?? label} was provided`
              }
            ];
          }

          let facts: unknown;
          try {
            facts = await withTimeout(
              (signal) =>
                definition.resolve(connection, parsedInput?.id ?? null, ctx, [...target.constraintIds], {
                  ...providerDeps,
                  signal
                }),
              RESOLVE_TIMEOUT_MS,
              `${getAppName(connection.app)} didn't respond in time`
            );
          } catch (error) {
            if (!(error instanceof BadRequestError)) {
              logger.error(error, `Auto-approval subject resolution failed [connectionId=${target.connectionId}]`);
            }
            return [
              key,
              {
                ...target,
                label,
                definition,
                facts: null,
                error: error instanceof BadRequestError ? error.message : `Couldn't reach ${getAppName(connection.app)}`
              }
            ];
          }

          const stableId = parsedInput ? (definition.getStableId?.(facts) ?? parsedInput.id) : null;
          const previouslyUsed = Boolean(
            parsedInput &&
            stableId &&
            target.constraintIds.has(AUTO_APPROVAL_UNUSED_CONSTRAINT) &&
            (await isRecordUsed({
              connectionId: target.connectionId,
              subject: target.subject,
              stableId,
              recordId: parsedInput.id
            }))
          );
          return [
            key,
            {
              ...target,
              label,
              definition,
              facts,
              error: null,
              recordId: parsedInput?.id ?? null,
              stableId,
              previouslyUsed
            }
          ];
        }
      )
    );

    const resolved = new Map(resolvedEntries);
    const stableIdByInputId = new Map(
      [...resolved.values()].flatMap(({ inputId, stableId }) => (inputId && stableId ? [[inputId, stableId]] : []))
    );

    const aiDeadline = Date.now() + AI_EVALUATION_BUDGET_MS;

    const runAiCondition = async (condition: TStoredAutoApproval["rules"][number]["conditions"][number]) => {
      const contextConnections = await Promise.all(condition.contextConnectionIds.map(loadConnection));
      if (contextConnections.some((connection) => !connection)) {
        const error = "A connection this AI check reads from is no longer available";
        return { approve: false, reason: error, model: "", toolCalls: [], error } satisfies TAiJudgeResult;
      }

      // The connections the request form fields read from are context too, so the AI can open a linked record
      const inputConnections = (
        await Promise.all(
          [...new Set(stored.inputs.map((input) => input.connectionId))]
            .filter((connectionId) => !condition.contextConnectionIds.includes(connectionId))
            .map(loadConnection)
        )
      ).filter((connection): connection is TAppConnection =>
        Boolean(connection && AI_CONTEXT_APPS.includes(connection.app as AppConnection))
      );

      const inputs = await Promise.all(
        parsedInputs.map(async (input) => ({
          label: input.label,
          value: input.id,
          connectionName: (await loadConnection(input.connectionId))?.name ?? null
        }))
      );

      return aiService.runJudge({
        orgId,
        instructions: condition.prompt ?? "",
        request: {
          policyType: ctx.request?.policyType ?? "",
          policyName: ctx.request?.policyName ?? "",
          requester: ctx.request?.requester ?? { name: null, email: ctx.requester.email },
          justification: ctx.request?.justification ?? null,
          duration: ctx.request?.duration ?? null,
          details: ctx.request?.details ?? null,
          inputs
        },
        tools: buildAppConnectionAiTools(
          [...(contextConnections as TAppConnection[]), ...inputConnections],
          providerDeps
        ),
        deadline: aiDeadline
      });
    };

    const deterministic = evaluateAutoApprovalRules(stored.rules, resolved, ctx);
    const aiResults = new Map<string, TAiConditionResult>();
    // A rule without AI that already passes decides the request, so the model isn't called for nothing
    let isApproved = deterministic.rules.some((rule) => rule.passed && !rule.conditions.some(isAiCondition));
    for await (const rule of stored.rules) {
      const aiConditions = rule.conditions.filter(isAiCondition);
      const evaluatedRule = deterministic.rules.find((candidate) => candidate.id === rule.id);
      const othersPassed = Boolean(
        evaluatedRule?.conditions.every((condition) => isAiCondition(condition) || condition.passed)
      );

      if (isApproved) {
        aiConditions.forEach((condition) =>
          aiResults.set(condition.id, {
            passed: false,
            reason: "Not reviewed because another rule approved the request",
            ai: null
          })
        );
      } else if (!aiConditions.length) {
        isApproved = Boolean(evaluatedRule?.passed);
      } else if (!othersPassed) {
        aiConditions.forEach((condition) =>
          aiResults.set(condition.id, {
            passed: false,
            reason: "Not reviewed because another condition in this rule didn't pass",
            ai: null
          })
        );
      } else {
        let allApproved = true;
        for await (const condition of aiConditions) {
          if (aiDeadline - Date.now() < AI_MIN_REMAINING_MS) {
            aiResults.set(condition.id, {
              passed: false,
              reason: "Not reviewed because the AI ran out of time on earlier rules",
              ai: null
            });
            allApproved = false;
            // eslint-disable-next-line no-continue
            continue;
          }
          const result = await runAiCondition(condition);
          aiResults.set(condition.id, {
            passed: result.approve,
            reason: result.approve ? null : result.reason,
            ai: result
          });
          if (!result.approve) allApproved = false;
        }
        isApproved = allApproved;
      }
    }

    const { rules, approvedByRuleId } = evaluateAutoApprovalRules(stored.rules, resolved, ctx, aiResults);

    return {
      version: 1,
      evaluatedAt: new Date().toISOString(),
      approvedByRuleId,
      inputs: parsedInputs.map((input) => ({ ...input, stableId: stableIdByInputId.get(input.inputId) ?? input.id })),
      subjects: [...resolved.values()].map(({ connectionId, subject, inputId, facts, error }) => ({
        connectionId,
        subject,
        inputId,
        facts,
        error
      })),
      rules
    };
  };

  const getCatalog = async ({ projectId, actor }: { projectId: string; actor: TApprovalActor }) => {
    // Someone who manages a policy without rights to the project's own connections still sees the org's
    const listConnections = async (app: (typeof AUTO_APPROVAL_APPS)[number]) => {
      try {
        return await appConnectionService.listAvailableAppConnectionsForUser(app, actor as OrgServiceActor, projectId);
      } catch (error) {
        if (error instanceof ForbiddenError) {
          return appConnectionService.listAvailableAppConnectionsForUser(app, actor as OrgServiceActor);
        }
        throw error;
      }
    };

    const apps = [...new Set([...AUTO_APPROVAL_APPS, ...AI_CONTEXT_APPS])];
    const [listed, aiModel] = await Promise.all([
      Promise.all(apps.map(async (app) => [app, await listConnections(app)] as const)),
      aiService.getOrgAiModel(actor.orgId)
    ]);
    const connectionsByApp = new Map(listed);

    return {
      apps: AUTO_APPROVAL_APPS,
      ai: {
        model: aiModel?.model ?? null,
        contextApps: AI_CONTEXT_APPS,
        contextConnections: AI_CONTEXT_APPS.flatMap((app) => connectionsByApp.get(app) ?? []).map((connection) => ({
          id: connection.id,
          name: connection.name,
          app: connection.app,
          tools: listAppConnectionAiTools(connection.app)
        }))
      },
      connections: AUTO_APPROVAL_APPS.flatMap((app) => connectionsByApp.get(app) ?? []).flatMap((connection) => {
        const provider = getAutoApprovalProvider(connection.app);
        if (!provider) return [];

        return [
          {
            id: connection.id,
            name: connection.name,
            app: connection.app,
            subjects: Object.entries(provider.subjects).map(([id, subject]) => ({
              id,
              label: subject.label,
              input: subject.input ? { label: subject.input.label, placeholder: subject.input.placeholder } : null,
              constraints: [
                ...Object.entries(subject.constraints).map(([constraintId, constraint]) => ({
                  id: constraintId,
                  label: constraint.label,
                  value: constraint.value,
                  hasOptions: Boolean(constraint.listOptions)
                })),
                ...(subject.input
                  ? [{ id: AUTO_APPROVAL_UNUSED_CONSTRAINT, ...UNUSED_CONSTRAINT, hasOptions: false }]
                  : [])
              ]
            }))
          }
        ];
      })
    };
  };

  const listOptions = async ({
    projectId,
    actor,
    connectionId,
    subject: subjectId,
    constraint: constraintId,
    search,
    siblings
  }: {
    projectId: string;
    actor: TApprovalActor;
    connectionId: string;
    subject: string;
    constraint: string;
    search?: string;
    siblings: Record<string, string[]>;
  }) => {
    const connection = await appConnectionService.validateAppConnectionUsageById(
      AUTO_APPROVAL_APPS,
      { connectionId, projectId },
      actor as OrgServiceActor
    );

    const constraint = getAutoApprovalProvider(connection.app)?.subjects[subjectId]?.constraints[constraintId];
    if (!constraint) {
      throw new BadRequestError({
        message: `${getAppName(connection.app)} has no '${constraintId}' check on '${subjectId}'`
      });
    }

    if (!constraint.listOptions) return { options: [] };

    return {
      options: await constraint.listOptions(connection, { search: search?.trim() || undefined, siblings }, providerDeps)
    };
  };

  return {
    validateConfig,
    replaceConfig,
    findByPolicyIds,
    toPolicyResponse,
    getInputDetails,
    parseInputValues,
    evaluate,
    getCatalog,
    listOptions
  };
};
