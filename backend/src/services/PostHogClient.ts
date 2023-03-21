import { PostHog } from 'posthog-node';
import { getLogger } from '../utils/logger';
import {
  getNodeEnv,
  getTelemetryEnabled,
  getPostHogProjectApiKey,
  getPostHogHost
} from '../config';

/**
 * Logs telemetry enable/disable notice.
 */
const logTelemetryMessage = () => {
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
const getPostHogClient = () => {
  let postHogClient: any;
  if (getNodeEnv() === 'production' && getTelemetryEnabled()) {
    // case: enable opt-out telemetry in production
    postHogClient = new PostHog(getPostHogProjectApiKey(), {
      host: getPostHogHost()
    });
  } 
  
  return postHogClient;
}

export {
  logTelemetryMessage,
  getPostHogClient
}

