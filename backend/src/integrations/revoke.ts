import * as Sentry from '@sentry/node';
import { 
  IIntegrationAuth, 
  IntegrationAuth, 
  Integration,
  Bot,
  BotKey
} from '../models';
import {
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
  INTEGRATION_GITLAB,
  INTEGRATION_GCP_SECRET_MANAGER
} from '../variables';

const revokeAccess = async ({
  integrationAuth,
  accessToken
}: {
  integrationAuth: IIntegrationAuth;
  accessToken: string;
}) => {
  let deletedIntegrationAuth;
  try {
    // add any integration-specific revocation logic
    switch (integrationAuth.integration) {
      case INTEGRATION_HEROKU:
        break;
      case INTEGRATION_VERCEL:
        break;
      case INTEGRATION_NETLIFY:
        break;
      case INTEGRATION_GITHUB:
        break;
      case INTEGRATION_GITLAB:
        break;
      case INTEGRATION_GCP_SECRET_MANAGER:
        break;
    }

    deletedIntegrationAuth = await IntegrationAuth.findOneAndDelete({
      _id: integrationAuth._id
    });

    if (deletedIntegrationAuth) {
      await Integration.deleteMany({
        integrationAuth: deletedIntegrationAuth._id
      });
    }
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed to delete integration authorization');
  }
  
  return deletedIntegrationAuth;
};

export { revokeAccess };
