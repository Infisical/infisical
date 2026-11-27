import { RuleViolationError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { logger } from "@app/lib/logger";

import { MicrosoftTeamsTokenKind } from "../../models/microsoft-teams-installation";
import { WorkflowIntegration } from "../../models/workflow-integration";
import { TMicrosoftTeamsAppCredentials, TMicrosoftTeamsClient, TWorkflowIntegrationsStores } from "../dependencies";

export type TMicrosoftTeamsAccessDeps = {
  transactionRunner: TTransactionRunner<TWorkflowIntegrationsStores>;
  kmsDataKeyService: TKmsDataKeyService;
  instanceConfigService: TInstanceConfigService;
  microsoftTeamsClient: TMicrosoftTeamsClient;
  now: () => Date;
};

export type TMicrosoftTeamsProbe =
  | { installed: true; internalAppId: string; graphToken: string; botToken: string }
  | { installed: false };

// The instance's Teams app, refused with a readable message when any part of it is not set.
export const configuredMicrosoftTeamsCredentials = async (
  instanceConfigService: TInstanceConfigService
): Promise<TMicrosoftTeamsAppCredentials> => {
  const { credentials } = await instanceConfigService.getMicrosoftTeamsCredentials();
  if (!credentials.isComplete()) {
    throw new RuleViolationError({ message: "Microsoft Teams app ID, client secret, or bot ID is not set" });
  }
  return { appId: credentials.appId, clientSecret: credentials.clientSecret, botId: credentials.botId };
};

// The integration's token of this kind: the stored one while it is good for five more minutes, else a new one. A new
// token is saved in its own short transaction after the call to Microsoft, on the row as it is then, so the refresh
// never overwrites a rename or status change made meanwhile.
export const microsoftTeamsToken = async (
  deps: TMicrosoftTeamsAccessDeps,
  integration: WorkflowIntegration,
  credentials: TMicrosoftTeamsAppCredentials,
  kind: MicrosoftTeamsTokenKind
): Promise<string> => {
  const installation = integration.microsoftTeamsInstallation();
  const { encryptor, decryptor } = await deps.kmsDataKeyService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId: integration.orgId
  });

  const cached = installation.cachedToken(kind, deps.now());
  if (cached) return decryptor({ cipherTextBlob: cached }).toString();

  const issued = await deps.microsoftTeamsClient.issueToken({ credentials, tenantId: installation.tenantId, kind });
  const { cipherTextBlob } = encryptor({ plainText: Buffer.from(issued.accessToken) });
  await deps.transactionRunner.run(async ({ stores }) => {
    const current = await stores.workflowIntegrationStore.findByIdForUpdate(integration.id);
    if (!current) return;
    current.changeMicrosoftTeamsInstallation((teams) => teams.withToken(kind, cipherTextBlob, issued.expiresAt));
    await stores.workflowIntegrationStore.save(current);
  });
  return issued.accessToken;
};

// Whether the Infisical bot is in the integration's tenant. Never throws: a token or catalog failure counts as not
// installed, as it always has.
export const probeMicrosoftTeamsInstall = async (
  deps: TMicrosoftTeamsAccessDeps,
  integration: WorkflowIntegration,
  credentials: TMicrosoftTeamsAppCredentials
): Promise<TMicrosoftTeamsProbe> => {
  try {
    const botToken = await microsoftTeamsToken(deps, integration, credentials, MicrosoftTeamsTokenKind.BotFramework);
    const graphToken = await microsoftTeamsToken(deps, integration, credentials, MicrosoftTeamsTokenKind.Graph);
    const app = await deps.microsoftTeamsClient.findInstalledApp({ graphToken, botId: credentials.botId });
    if (!app) return { installed: false };
    return { installed: true, internalAppId: app.internalAppId, graphToken, botToken };
  } catch (error) {
    logger.error(error, `Failed to check the Microsoft Teams bot install [integrationId=${integration.id}]`);
    return { installed: false };
  }
};
