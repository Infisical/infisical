import { UserAgentType } from "../ee/models"

export const getUserAgentType = function (userAgent: string | undefined) {
  if (userAgent == undefined) {
    return UserAgentType.OTHER;
  } else if (userAgent == UserAgentType.CLI) {
    return UserAgentType.CLI;
  } else if (userAgent == UserAgentType.K8_OPERATOR) {
    return UserAgentType.K8_OPERATOR;
  } else if (userAgent == UserAgentType.TERRAFORM) {
    return UserAgentType.TERRAFORM;
  } else if (userAgent.toLowerCase().includes("mozilla")) {
    return UserAgentType.WEB;
  } else if (userAgent.includes(UserAgentType.NODE_SDK)) {
    return UserAgentType.NODE_SDK;
  } else if (userAgent.includes(UserAgentType.PYTHON_SDK)) {
    return UserAgentType.PYTHON_SDK;
  } else {
    return UserAgentType.OTHER;
  }
} 