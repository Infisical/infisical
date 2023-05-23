import { PostHog } from 'posthog-node';
import { getLogger } from '../utils/logger';
import {
  getNodeEnv,
  getTelemetryEnabled,
  getPostHogProjectApiKey,
  getPostHogHost
} from '../config';
import {
  IUser,
  IServiceAccount,
  IServiceTokenData
} from '../models';
import {
  BadRequestError
} from '../utils/errors';

class Telemetry {
  /**
   * Logs telemetry enable/disable notice.
   */
  static logTelemetryMessage = () => {
    if(!getTelemetryEnabled()){
      getLogger("backend-main").info([
        "",
        "To improve, Infisical collects telemetry data about general usage.",
        "This helps us understand how the product is doing and guide our product development to create the best possible platform; it also helps us demonstrate growth as we support Infisical as open-source software.",
        "To opt into telemetry, you can set `TELEMETRY_ENABLED=true` within the environment variables.",
      ].join('\n'))
    }
  }

  /**
   * Return an instance of the PostHog client initialized.
   * @returns 
   */
  static getPostHogClient = () => {
    let postHogClient: any;
    if (getNodeEnv() === 'production' && getTelemetryEnabled()) {
      // case: enable opt-out telemetry in production
      postHogClient = new PostHog(getPostHogProjectApiKey(), {
        host: getPostHogHost()
      });
    } 
    
    return postHogClient;
  }

  /**
   * Return a distinct id for client to be used for logging telemetry
   */
  static getDistinctId = ({
    user,
    serviceAccount,
    serviceTokenData
  }: {
    user?: IUser;
    serviceAccount?: IServiceAccount;
    serviceTokenData?: IServiceTokenData;
  }) => {
    let distinctId = '';
    
    if (user) {
      distinctId = user.email;
    }
    
    if (serviceAccount) {
      distinctId = `sa.${serviceAccount._id}`;
    }
    
    if (serviceTokenData) {
      distinctId = `st.${serviceTokenData._id}`;
    }
    
    if (distinctId === '') {
      throw BadRequestError({
        message: 'Failed to obtain distinct id for logging telemetry'
      });
    }
    
    return distinctId;
  }
}

export default Telemetry;