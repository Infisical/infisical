import { UserAgentType } from "../ee/models"

export const getUserAgentType = function (userAgent: string | undefined) {
  if (userAgent == undefined) {
    return UserAgentType.OTHER;
  } else if (userAgent == UserAgentType.CLI) {
    return UserAgentType.CLI;
  } else if (userAgent == UserAgentType.K8_OPERATOR) {
    return UserAgentType.K8_OPERATOR;
  } else if (userAgent.toLowerCase().includes("mozilla")) {
    return UserAgentType.WEB;
  } else {
    return UserAgentType.OTHER;
  }
} 