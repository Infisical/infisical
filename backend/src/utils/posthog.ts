const CLI_USER_AGENT_NAME = "cli"
const K8_OPERATOR_AGENT_NAME = "k8-operator"
export const getChannelFromUserAgent = function (userAgent: string | undefined) {
  if (userAgent == undefined) {
    return "other"
  } else if (userAgent == CLI_USER_AGENT_NAME) {
    return "cli"
  } else if (userAgent == K8_OPERATOR_AGENT_NAME) {
    return "k8-operator"
  } else if (userAgent.toLowerCase().includes('mozilla')) {
    return "web"
  } else {
    return "other"
  }
} 