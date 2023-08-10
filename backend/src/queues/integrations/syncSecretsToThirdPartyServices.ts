import Queue, { Job } from "bull";
import Integration from "../../models/integration";
import IntegrationAuth from "../../models/integrationAuth";
import { BotService } from "../../services";
import { getIntegrationAuthAccessHelper } from "../../helpers";
import { syncSecrets } from "../../integrations/sync"


type TSyncSecretsToThirdPartyServices = {
  workspaceId: string
  environment?: string
}

export const syncSecretsToThirdPartyServices = new Queue('sync-secrets-to-third-party-services', process.env.REDIS_URL as string);

syncSecretsToThirdPartyServices.process(async (job: Job) => {
  const { workspaceId, environment }: TSyncSecretsToThirdPartyServices = job.data
  const integrations = await Integration.find({
    workspace: workspaceId,
    ...(environment
      ? {
        environment
      }
      : {}),
    isActive: true,
    app: { $ne: null }
  });

  // for each workspace integration, sync/push secrets
  // to that integration
  for await (const integration of integrations) {
    // get workspace, environment (shared) secrets
    const secrets = await BotService.getSecrets({
      workspaceId: integration.workspace,
      environment: integration.environment,
      secretPath: integration.secretPath
    });

    const integrationAuth = await IntegrationAuth.findById(integration.integrationAuth);

    if (!integrationAuth) throw new Error("Failed to find integration auth");

    // get integration auth access token
    const access = await getIntegrationAuthAccessHelper({
      integrationAuthId: integration.integrationAuth
    });

    // sync secrets to integration
    return await syncSecrets({
      integration,
      integrationAuth,
      secrets,
      accessId: access.accessId === undefined ? null : access.accessId,
      accessToken: access.accessToken
    });
  }
})

export const syncSecretsToActiveIntegrationsQueue = (jobDetails: TSyncSecretsToThirdPartyServices) => {
  syncSecretsToThirdPartyServices.add(jobDetails, {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000
    },
    removeOnComplete: true,
    removeOnFail: {
      count: 20 // keep the most recent 20 jobs
    }
  })
}

