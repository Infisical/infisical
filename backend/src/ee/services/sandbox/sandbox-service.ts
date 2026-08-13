import { OrganizationActionScope, SecretType, TSandboxes } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TSecretV2BridgeServiceFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-service";

import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { runAgentTurn, TAgentEventSink, TAgentMessage } from "./sandbox-agent";
import { installGithubCli, writeSandboxCaCertificate } from "./sandbox-cli-runtime";
import {
  getSandboxCommandLog,
  SandboxCommandSource,
  setSandboxCommandContext,
  subscribeToSandboxCommands,
  TSandboxCommandEntry
} from "./sandbox-command-log";
import { TSandboxDALFactory } from "./sandbox-dal";
import { deprovisionSandboxIdentity, provisionSandboxIdentity, TSandboxIdentityDeps } from "./sandbox-identity";
import { SANDBOX_INTEGRATIONS, SandboxCredentialRole, SandboxIntegrationType } from "./sandbox-integrations";
import { getPamProxies, startPamProxies, stopPamProxies } from "./sandbox-pam-runtime";
import { TSandboxProjectResolverFactory } from "./sandbox-project-resolver";
import { buildSystemPrompt } from "./sandbox-prompt";
import { getSandboxProxyLog, startSandboxProxy, stopSandboxProxy } from "./sandbox-proxy";
import { bootSandbox, execInSandbox, isSandboxBooted, setSandboxEnv, shutdownSandbox } from "./sandbox-runtime";
import {
  assertSlackConfigured,
  buildAddReactionCommand,
  buildInboxDeliveryCommand,
  buildPostMessageCommand,
  isDuplicateSlackMessage,
  logSlackRelay,
  parseSlackMessage,
  SLACK_ACK_REACTION,
  SLACK_DONE_REACTION,
  TSandboxSlackMessage,
  TSlackEventEnvelope,
  verifySlackSignature
} from "./sandbox-slack";
import {
  SandboxStatus,
  TAddSandboxIntegrationDTO,
  TCreateSandboxDTO,
  TExecInSandboxDTO,
  TRemoveSandboxIntegrationDTO,
  TSandbox,
  TSandboxExecResult,
  TSandboxGrants,
  TSandboxIdDTO,
  TSandboxIntegration,
  TUpdateSandboxDTO
} from "./sandbox-types";

type TSandboxServiceFactoryDep = {
  sandboxDAL: TSandboxDALFactory;
  secretService: Pick<TSecretV2BridgeServiceFactory, "getSecretByName">;
  sandboxProjectResolver: TSandboxProjectResolverFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
} & TSandboxIdentityDeps;

const EMPTY_GRANTS: TSandboxGrants = { integrations: [], pamAccountIds: [] };

const normalizeGrants = (value: unknown): TSandboxGrants => {
  const grants = (value ?? {}) as Partial<TSandboxGrants>;
  return {
    // Integrations stored before the credential config existed carry only a secret reference.
    // The catalog already describes how each type authenticates, so the config is derived rather
    // than guessed, and the row is read the same way whenever it was written.
    integrations: (grants.integrations ?? []).map((integration) => {
      if (integration.credential) return integration;

      const definition = SANDBOX_INTEGRATIONS[integration.type];
      return {
        ...integration,
        credential: {
          role: definition?.role ?? SandboxCredentialRole.HeaderRewrite,
          headerName: definition?.headerName ?? "Authorization",
          headerPrefix: definition?.headerPrefix ?? "Bearer"
        }
      };
    }),
    pamAccountIds: grants.pamAccountIds ?? []
  };
};

/** Status is never stored: it is whatever the runtime currently says, so a restart can't leave a row claiming to be running. */
const toSandbox = (row: TSandboxes): TSandbox => ({
  id: row.id,
  orgId: row.orgId,
  name: row.name,
  description: row.description ?? null,
  status: isSandboxBooted(row.id) ? SandboxStatus.Running : SandboxStatus.Stopped,
  vcpu: row.vcpu,
  memoryMb: row.memoryMb,
  grants: normalizeGrants(row.grants),
  agentType: (row.agentType as TSandbox["agentType"]) ?? null,
  hasAgentToken: Boolean(row.encryptedAgentToken),
  commandsRun: row.commandsRun,
  slackChannelId: row.slackChannelId ?? null,
  slackThreadTs: row.slackThreadTs ?? null,
  lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : null,
  createdAt: new Date(row.createdAt).toISOString()
});

export const sandboxServiceFactory = ({
  sandboxDAL,
  secretService,
  sandboxProjectResolver,
  permissionService,
  kmsService,
  identityService,
  identityUaService
}: TSandboxServiceFactoryDep) => {
  const $encryptAgentToken = async (orgId: string, token: string) => {
    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    return encryptor({ plainText: Buffer.from(token) }).cipherTextBlob;
  };

  const $decryptClientSecret = async (orgId: string, blob: Buffer) => {
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    return decryptor({ cipherTextBlob: blob }).toString();
  };

  /**
   * Sandboxes have no CASL subject of their own yet, so org membership plus the org-level Settings
   * ability stands in for it. A dedicated subject is the follow-up.
   */
  const $authorize = async (actor: OrgServiceActor, isWrite: boolean) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    const action = isWrite ? OrgPermissionActions.Edit : OrgPermissionActions.Read;
    if (!permission.can(action, OrgPermissionSubjects.Settings)) {
      throw new ForbiddenRequestError({
        message: isWrite
          ? "You do not have permission to manage sandboxes"
          : "You do not have permission to view sandboxes"
      });
    }
  };

  /** Scoped by orgId as well as id, so an ID from another org reads as not found rather than forbidden. */
  const $resolve = async (sandboxId: string, actor: OrgServiceActor, isWrite: boolean) => {
    await $authorize(actor, isWrite);

    const row = await sandboxDAL.findOne({ id: sandboxId, orgId: actor.orgId });
    if (!row) throw new NotFoundError({ message: `Sandbox with ID '${sandboxId}' was not found` });

    return row;
  };

  const listSandboxes = async (actor: OrgServiceActor): Promise<TSandbox[]> => {
    await $authorize(actor, false);
    const rows = await sandboxDAL.findByOrg(actor.orgId);
    return rows.map(toSandbox);
  };

  const getSandboxById = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor): Promise<TSandbox> =>
    toSandbox(await $resolve(sandboxId, actor, false));

  const createSandbox = async (dto: TCreateSandboxDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    await $authorize(actor, true);

    const clash = await sandboxDAL.findOne({ orgId: actor.orgId, name: dto.name });
    if (clash) throw new BadRequestError({ message: `A sandbox named '${dto.name}' already exists` });

    // Its own machine identity, so PAM sessions are attributable to this sandbox and deleting the
    // sandbox revokes its access with it.
    const identity = await provisionSandboxIdentity({ identityService, identityUaService }, dto.name, actor);

    const row = await sandboxDAL.create({
      orgId: actor.orgId,
      name: dto.name,
      description: dto.description ?? null,
      vcpu: dto.vcpu,
      memoryMb: dto.memoryMb,
      grants: EMPTY_GRANTS,
      commandsRun: 0,
      identityId: identity.identityId,
      identityClientId: identity.clientId,
      encryptedIdentityClientSecret: await $encryptAgentToken(actor.orgId, identity.clientSecret)
    });

    return toSandbox(row);
  };

  const updateSandbox = async (dto: TUpdateSandboxDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    const existing = await $resolve(dto.sandboxId, actor, true);

    const hasChange = [
      dto.name,
      dto.description,
      dto.vcpu,
      dto.memoryMb,
      dto.pamAccountIds,
      dto.agentType,
      dto.agentToken
    ].some((field) => field !== undefined);
    if (!hasChange) {
      throw new BadRequestError({
        message:
          "No fields to update. Supply at least one of name, description, vcpu, memoryMb, pamAccountIds, agentType or agentToken."
      });
    }

    if (dto.name && dto.name !== existing.name) {
      const clash = await sandboxDAL.findOne({ orgId: existing.orgId, name: dto.name });
      if (clash) throw new BadRequestError({ message: `A sandbox named '${dto.name}' already exists` });
    }

    const row = await sandboxDAL.updateById(dto.sandboxId, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.vcpu !== undefined && { vcpu: dto.vcpu }),
      ...(dto.memoryMb !== undefined && { memoryMb: dto.memoryMb }),
      ...(dto.agentType !== undefined && { agentType: dto.agentType }),
      ...(dto.agentToken !== undefined && {
        encryptedAgentToken: await $encryptAgentToken(actor.orgId, dto.agentToken)
      }),
      ...(dto.pamAccountIds !== undefined && {
        grants: { ...normalizeGrants(existing.grants), pamAccountIds: dto.pamAccountIds }
      })
    });

    return toSandbox(row);
  };

  const deleteSandbox = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    await $resolve(sandboxId, actor, true);

    // Reap the running processes before the row goes, or the runtime keeps a directory nothing owns.
    stopPamProxies(sandboxId);
    stopSandboxProxy(sandboxId);
    await shutdownSandbox(sandboxId);
    const row = await sandboxDAL.deleteById(sandboxId);

    if (row.identityId) {
      await deprovisionSandboxIdentity({ identityService, identityUaService }, row.identityId, actor).catch(
        (error: Error) => logger.error(error, `Failed to delete sandbox identity [sandboxId=${sandboxId}]`)
      );
    }

    return toSandbox(row);
  };

  const startSandbox = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    const row = await $resolve(sandboxId, actor, true);

    if (isSandboxBooted(sandboxId)) {
      throw new BadRequestError({ message: `Sandbox '${row.name}' is already running` });
    }

    const { rootDir } = await bootSandbox(sandboxId);

    // Open a brokered proxy per granted account and tell the sandbox only the port. The identity
    // token and the database credential both stay in this process.
    const grants = normalizeGrants(row.grants);
    const targets = await sandboxDAL.findPamAccountTargets(grants.pamAccountIds);
    const proxies =
      row.identityClientId && row.encryptedIdentityClientSecret
        ? await startPamProxies(sandboxId, targets, {
            clientId: row.identityClientId,
            clientSecret: await $decryptClientSecret(actor.orgId, row.encryptedIdentityClientSecret)
          }).catch((error: Error) => {
            logger.error(error, `Sandbox could not open PAM proxies [sandboxId=${sandboxId}]`);
            return [];
          })
        : [];

    // Resolve each integration's secret for the proxy. The sandbox only ever receives a placeholder.
    const integrationEnv: Record<string, string> = {};
    const resolved: (TSandboxIntegration & { secretValue: string })[] = [];

    for (const integration of grants.integrations) {
      const definition = SANDBOX_INTEGRATIONS[integration.type];
      try {
        // eslint-disable-next-line no-await-in-loop -- a handful of secrets, resolved once at start
        const secret = await secretService.getSecretByName({
          actor: actor.type,
          actorId: actor.id,
          actorOrgId: actor.orgId,
          actorAuthMethod: actor.authMethod,
          projectId: integration.secret.projectId,
          environment: integration.secret.environment,
          path: integration.secret.secretPath,
          secretName: integration.secret.secretKey,
          type: SecretType.Shared,
          viewSecretValue: true,
          expandSecretReferences: true
        });

        if (secret?.secretValue) {
          resolved.push({ ...integration, secretValue: secret.secretValue });
          // The real value never leaves this process: the proxy swaps it in on the way out.
          integrationEnv[definition.envVarName] = `infisical-placeholder-${integration.id.slice(0, 8)}`;
        }
      } catch (error) {
        logger.error(
          error,
          `Sandbox could not resolve integration secret [sandboxId=${sandboxId}] [key=${integration.secret.secretKey}]`
        );
      }

      if (definition.cli?.name === "gh") {
        // eslint-disable-next-line no-await-in-loop
        await installGithubCli(rootDir).catch((error: Error) =>
          logger.error(error, `Failed to install gh [sandboxId=${sandboxId}]`)
        );
      }
    }

    const { port: proxyPort, certificatePem } = await startSandboxProxy(sandboxId, resolved);
    const caPath = await writeSandboxCaCertificate(rootDir, certificatePem);
    const proxyUrl = `http://127.0.0.1:${proxyPort}`;

    setSandboxCommandContext(sandboxId, {
      pamProxies: proxies,
      hostnames: grants.integrations.flatMap((integration) => integration.hostnames)
    });

    setSandboxEnv(sandboxId, {
      ...integrationEnv,
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
      NO_PROXY: "localhost,127.0.0.1",
      // Trust the proxy's CA. Go (gh), curl, node and python each read a different variable.
      SSL_CERT_FILE: caPath,
      CURL_CA_BUNDLE: caPath,
      NODE_EXTRA_CA_CERTS: caPath,
      REQUESTS_CA_BUNDLE: caPath,
      ...Object.fromEntries(
        proxies.map((proxy) => [
          `PAM_${proxy.accountName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_PORT`,
          String(proxy.port)
        ])
      ),
      ...(proxies[0] && { PGHOST: "127.0.0.1", PGPORT: String(proxies[0].port) })
    });

    return toSandbox(row);
  };

  const stopSandbox = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor): Promise<TSandbox> => {
    const row = await $resolve(sandboxId, actor, true);

    if (!isSandboxBooted(sandboxId)) {
      throw new BadRequestError({ message: `Sandbox '${row.name}' is not running` });
    }

    stopPamProxies(sandboxId);
    stopSandboxProxy(sandboxId);
    await shutdownSandbox(sandboxId);
    return toSandbox(row);
  };

  const execCommand = async (
    { sandboxId, command }: TExecInSandboxDTO,
    actor: OrgServiceActor
  ): Promise<TSandboxExecResult> => {
    const row = await $resolve(sandboxId, actor, true);

    if (!isSandboxBooted(sandboxId)) {
      throw new BadRequestError({
        message: `Sandbox '${row.name}' is not running. Start it before running commands.`
      });
    }

    const result = await execInSandbox(sandboxId, command);

    await sandboxDAL.updateById(sandboxId, {
      $incr: { commandsRun: 1 },
      lastActivityAt: new Date()
    });

    return result;
  };

  const addIntegration = async (
    { sandboxId, integration }: TAddSandboxIntegrationDTO,
    actor: OrgServiceActor
  ): Promise<TSandbox> => {
    const existing = await $resolve(sandboxId, actor, true);
    const definition = SANDBOX_INTEGRATIONS[integration.type];

    // Known integrations own their hostnames so a caller can't widen a GitHub grant to another host;
    // Custom is the only type that takes them from the request.
    const hostnames =
      integration.type === SandboxIntegrationType.Custom
        ? [...new Set((integration.hostnames ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean))]
        : definition.hostnames;

    if (!hostnames.length) {
      throw new BadRequestError({ message: "Provide at least one hostname for a custom endpoint" });
    }

    // Known types own their credential config too, for the same reason they own their hostnames:
    // otherwise a caller could point a "GitHub" grant at a header of their choosing.
    const credential =
      integration.type === SandboxIntegrationType.Custom
        ? (integration.credential ?? {
            role: SandboxCredentialRole.HeaderRewrite,
            headerName: definition.headerName,
            headerPrefix: definition.headerPrefix
          })
        : {
            role: definition.role,
            headerName: definition.headerName,
            headerPrefix: definition.headerPrefix
          };

    if (credential.role === SandboxCredentialRole.HeaderRewrite && !credential.headerName?.trim()) {
      throw new BadRequestError({ message: "A header rewrite requires a header name" });
    }

    if (
      credential.role === SandboxCredentialRole.Substitution &&
      (!credential.placeholderKey?.trim() ||
        !credential.placeholderValue?.trim() ||
        !credential.substitutionSurfaces?.length)
    ) {
      throw new BadRequestError({
        message:
          "Secret substitution requires an environment variable name, a placeholder value, and at least one surface to replace in"
      });
    }

    const grants = normalizeGrants(existing.grants);
    const added: TSandboxIntegration = {
      id: crypto.randomUUID(),
      type: integration.type,
      hostnames,
      secret: integration.secret,
      credential
    };

    const row = await sandboxDAL.updateById(sandboxId, {
      grants: { ...grants, integrations: [...grants.integrations, added] }
    });

    return toSandbox(row);
  };

  const removeIntegration = async (
    { sandboxId, integrationId }: TRemoveSandboxIntegrationDTO,
    actor: OrgServiceActor
  ): Promise<TSandbox> => {
    const existing = await $resolve(sandboxId, actor, true);
    const grants = normalizeGrants(existing.grants);

    const remaining = grants.integrations.filter((item) => item.id !== integrationId);
    if (remaining.length === grants.integrations.length) {
      throw new NotFoundError({ message: `Integration with ID '${integrationId}' was not found` });
    }

    const row = await sandboxDAL.updateById(sandboxId, { grants: { ...grants, integrations: remaining } });
    return toSandbox(row);
  };

  const chatWithAgent = async (
    { sandboxId, messages, onEvent }: TSandboxIdDTO & { messages: TAgentMessage[]; onEvent?: TAgentEventSink },
    actor: OrgServiceActor
  ) => {
    const row = await $resolve(sandboxId, actor, true);

    if (!isSandboxBooted(sandboxId)) {
      throw new BadRequestError({
        message: `Sandbox '${row.name}' is not running. Start it before chatting with the agent.`
      });
    }

    if (!row.encryptedAgentToken) {
      throw new BadRequestError({
        message: "This sandbox has no agent API key. Add one under the Agent section before chatting."
      });
    }

    return runAgentTurn({
      sandboxId,
      apiKey: await $decryptClientSecret(actor.orgId, row.encryptedAgentToken),
      systemPrompt: buildSystemPrompt(toSandbox(row), getPamProxies(sandboxId)),
      messages,
      onEvent
    });
  };

  const getCommandLog = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor) => {
    await $resolve(sandboxId, actor, false);
    return getSandboxCommandLog(sandboxId);
  };

  /**
   * Sends the backlog first, then each new command as it is recorded, so a client that connects
   * mid-run sees the whole session rather than only what happens after it arrived.
   */
  const streamCommandLog = async (
    { sandboxId, onEntry }: TSandboxIdDTO & { onEntry: (entry: TSandboxCommandEntry) => void },
    actor: OrgServiceActor
  ) => {
    await $resolve(sandboxId, actor, false);
    getSandboxCommandLog(sandboxId).forEach(onEntry);
    return subscribeToSandboxCommands(sandboxId, onEntry);
  };

  const getProxyActivity = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor) => {
    await $resolve(sandboxId, actor, false);
    return getSandboxProxyLog(sandboxId);
  };

  const listPamProxies = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor) => {
    await $resolve(sandboxId, actor, false);
    return getPamProxies(sandboxId);
  };

  /** The agent's system prompt, describing every tool the sandbox has and how it is authenticated. */
  const getSystemPrompt = async ({ sandboxId }: TSandboxIdDTO, actor: OrgServiceActor) => {
    const row = await $resolve(sandboxId, actor, false);
    return buildSystemPrompt(toSandbox(row), getPamProxies(sandboxId));
  };

  const resolveProjectId = async (actor: OrgServiceActor) => {
    await $authorize(actor, false);
    return sandboxProjectResolver.resolve(actor);
  };

  const linkSlackConversation = async (
    { sandboxId, channelId, threadTs }: { sandboxId: string; channelId: string | null; threadTs: string | null },
    actor: OrgServiceActor
  ) => {
    await $resolve(sandboxId, actor, true);
    // A thread without a channel would never match an inbound message, so it is cleared with it.
    const updated = await sandboxDAL.updateById(sandboxId, {
      slackChannelId: channelId,
      slackThreadTs: channelId ? threadTs : null
    });
    return toSandbox(updated);
  };

  /**
   * Answers a Slack mention. The agent runs here rather than in the sandbox, so its reply comes back
   * as a string and only the delivery has to happen inside: the API holds no Slack token, and the
   * integration brokers it on the wire.
   */
  const $answerSlackMessage = async (sandbox: TSandboxes, message: TSandboxSlackMessage) => {
    const replyTo = message.threadTs ?? message.ts;

    // An agent turn takes tens of seconds, and silence that long reads as broken. The reaction needs
    // a scope the app may not have, so a failure falls back to saying so on the thread.
    const ack = await execInSandbox(
      sandbox.id,
      buildAddReactionCommand({ channelId: message.channelId, messageTs: message.ts, name: SLACK_ACK_REACTION }),
      SandboxCommandSource.Slack
    );
    const acked = ack.stdout.includes('"ok":true');
    if (!acked) {
      // Usually a missing reactions:write scope, but log what Slack said so it is not a guess.
      logger.info(
        { sandboxId: sandbox.id, response: ack.stdout.slice(-200), stderr: ack.stderr.slice(-200) },
        `Slack reaction unavailable, falling back to a message [sandboxId=${sandbox.id}]`
      );
      const fallback = await execInSandbox(
        sandbox.id,
        buildPostMessageCommand({ channelId: message.channelId, threadTs: replyTo, text: "On it..." }),
        SandboxCommandSource.Slack
      );
      if (!fallback.stdout.includes('"ok":true')) {
        logger.warn(
          { sandboxId: sandbox.id, response: fallback.stdout.slice(-200) },
          `Could not acknowledge the Slack message at all [sandboxId=${sandbox.id}]`
        );
      }
    }

    try {
      if (!sandbox.encryptedAgentToken) {
        throw new BadRequestError({ message: "This sandbox has no agent API key." });
      }

      const turn = await runAgentTurn({
        sandboxId: sandbox.id,
        apiKey: await $decryptClientSecret(sandbox.orgId, sandbox.encryptedAgentToken),
        systemPrompt: buildSystemPrompt(toSandbox(sandbox), getPamProxies(sandbox.id)),
        messages: [{ role: "user", content: message.text }]
      });

      const posted = await execInSandbox(
        sandbox.id,
        buildPostMessageCommand({ channelId: message.channelId, threadTs: replyTo, text: turn.reply }),
        SandboxCommandSource.Slack
      );
      // The exec succeeding only means curl ran. Slack reports its own failures in the body, so a
      // delivery that never reached the channel would otherwise be logged as an answer.
      if (!posted.stdout.includes('"ok":true')) {
        logger.error(
          { sandboxId: sandbox.id, response: posted.stdout.slice(-300), stderr: posted.stderr.slice(-300) },
          `Slack rejected the agent's reply [sandboxId=${sandbox.id}]`
        );
        return;
      }

      if (acked) {
        const done = await execInSandbox(
          sandbox.id,
          buildAddReactionCommand({ channelId: message.channelId, messageTs: message.ts, name: SLACK_DONE_REACTION }),
          SandboxCommandSource.Slack
        );
        if (!done.stdout.includes('"ok":true')) {
          logger.info(
            { sandboxId: sandbox.id, response: done.stdout.slice(-200) },
            `Could not mark the Slack message done [sandboxId=${sandbox.id}]`
          );
        }
      }

      logger.info(`Agent answered a Slack message [sandboxId=${sandbox.id}] [channelId=${message.channelId}]`);
    } catch (err) {
      logger.error({ sandboxId: sandbox.id, err }, `Agent failed to answer Slack [sandboxId=${sandbox.id}]`);
      await execInSandbox(
        sandbox.id,
        buildPostMessageCommand({
          channelId: message.channelId,
          threadTs: replyTo,
          text: "I could not answer that. Check the sandbox's agent configuration."
        })
      ).catch(() => {});
    }
  };

  const handleSlackEvent = async ({
    rawBody,
    timestamp,
    signature
  }: {
    rawBody: string;
    timestamp: string;
    signature: string;
  }): Promise<string | null> => {
    const signingSecret = assertSlackConfigured(getConfig().SANDBOX_SLACK_SIGNING_SECRET);
    verifySlackSignature({ signingSecret, rawBody, timestamp, signature });

    const envelope = JSON.parse(rawBody) as TSlackEventEnvelope;
    if (envelope.type === "url_verification") return envelope.challenge ?? null;

    const message = parseSlackMessage(envelope);
    if (!message) return null;

    if (isDuplicateSlackMessage(message)) {
      logger.info(`Ignored a repeat Slack delivery [channelId=${message.channelId}] [ts=${message.ts}]`);
      return null;
    }

    const sandbox = await sandboxDAL.findBySlackConversation(message.channelId, message.threadTs);
    if (!sandbox) return null;

    if (!isSandboxBooted(sandbox.id)) {
      logger.info(`Dropped Slack message for a stopped sandbox [sandboxId=${sandbox.id}]`);
      return null;
    }

    await execInSandbox(sandbox.id, buildInboxDeliveryCommand(message), SandboxCommandSource.Slack);
    await sandboxDAL.updateById(sandbox.id, { lastActivityAt: new Date() });
    logSlackRelay(sandbox.id, message);

    // Slack retries anything it does not get a 2xx for within three seconds, and an agent turn is far
    // slower than that, so the answer is deliberately not awaited.
    void $answerSlackMessage(sandbox, message);

    return null;
  };

  return {
    chatWithAgent,
    getCommandLog,
    streamCommandLog,
    linkSlackConversation,
    handleSlackEvent,
    getProxyActivity,
    getSystemPrompt,
    listPamProxies,
    addIntegration,
    removeIntegration,
    resolveProjectId,
    listSandboxes,
    getSandboxById,
    createSandbox,
    updateSandbox,
    deleteSandbox,
    startSandbox,
    stopSandbox,
    execCommand
  };
};

export type TSandboxServiceFactory = ReturnType<typeof sandboxServiceFactory>;
