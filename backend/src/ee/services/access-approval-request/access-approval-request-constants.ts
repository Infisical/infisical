export const externallyReviewedAccessRequestMessage = (requestId: string) =>
  `Access request with ID '${requestId}' is reviewed in an external approval system and cannot be approved or rejected in Infisical. Cancel it, or wait for that system to decide.`;
