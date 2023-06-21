import { PostHog } from "posthog-node";
import { getLogger } from "../utils/logger";
import { AuthData } from "../interfaces/middleware";
import {
  getNodeEnv,
  getPostHogHost,
  getPostHogProjectApiKey,
  getTelemetryEnabled,
} from "../config";
import {
  ServiceAccount,
  ServiceTokenData,
  User,
} from "../models";
import {
  AccountNotFoundError,
  BadRequestError,
} from "../utils/errors";

class Telemetry {
  /**
   * Logs telemetry enable/disable notice.
   */
  static logTelemetryMessage = async () => {
    if(!(await getTelemetryEnabled())){
      (await getLogger("backend-main")).info([
        "",
        "To improve, Infisical collects telemetry data about general usage.",
        "This helps us understand how the product is doing and guide our product development to create the best possible platform; it also helps us demonstrate growth as we support Infisical as open-source software.",
        "To opt into telemetry, you can set `TELEMETRY_ENABLED=true` within the environment variables.",
      ].join("\n"))
    }
  }

  /**
   * Return an instance of the PostHog client initialized.
   * @returns 
   */
  static getPostHogClient = async () => {
    let postHogClient: any;
    if ((await getNodeEnv()) === "production" && (await getTelemetryEnabled())) {
      // case: enable opt-out telemetry in production
      postHogClient = new PostHog(await getPostHogProjectApiKey(), {
        host: await getPostHogHost(),
      });
    } 
    
    return postHogClient;
  }

  static getDistinctId = async ({
    authData,
  }: {
    authData: AuthData;
  }) => {
    let distinctId = "";
    if (authData.authPayload instanceof User) {
      distinctId = authData.authPayload.email;
    } else if (authData.authPayload instanceof ServiceAccount) {
      distinctId = `sa.${authData.authPayload._id.toString()}`;
    } else if (authData.authPayload instanceof ServiceTokenData) {
      
      if (authData.authPayload.user) {
        const user = await User.findById(authData.authPayload.user, "email");
        if (!user) throw AccountNotFoundError();
        distinctId = user.email; 
      } else if (authData.authPayload.serviceAccount) {
        distinctId = distinctId = `sa.${authData.authPayload.serviceAccount.toString()}`;
      }
    }
    
    if (distinctId === "") throw BadRequestError({
      message: "Failed to obtain distinct id for logging telemetry",
    });
    
    return distinctId;
  }
}

export default Telemetry;