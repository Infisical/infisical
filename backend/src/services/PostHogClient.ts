import infisical from 'infisical-node';
import { PostHog } from 'posthog-node';
import { getLogger } from '../utils/logger';

/**
 * Logs telemetry enable/disable notice.
 */
const logTelemetryMessage = () => {
  const TELEMETRY_ENABLED = infisical.get('TELEMETRY_ENABLED')! !== 'false' && true;
  if(!TELEMETRY_ENABLED){
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
  const TELEMETRY_ENABLED = infisical.get('TELEMETRY_ENABLED')! !== 'false' && true;
  if (infisical.get('NODE_ENV') === 'production' && TELEMETRY_ENABLED) {
    // case: enable opt-out telemetry in production
    postHogClient = new PostHog(infisical.get('POSTHOG_PROJECT_API_KEY')! || 'phc_nSin8j5q2zdhpFDI1ETmFNUIuTG4DwKVyIigrY10XiE', {
      host: infisical.get('POSTHOG_HOST')!
    });
  } 
  
  return postHogClient;
}

export {
  logTelemetryMessage,
  getPostHogClient
}

