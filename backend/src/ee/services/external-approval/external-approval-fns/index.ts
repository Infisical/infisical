import { UnrecoverableError } from "bullmq";

import { ExternalApprovalType } from "../external-approval-enums";
import { TExternalApprovalProviderFns } from "../external-approval-types";
import { servicenowFactory } from "./servicenow";

const EXTERNAL_APPROVAL_PROVIDER_FNS: Record<ExternalApprovalType, TExternalApprovalProviderFns> = {
  [ExternalApprovalType.ServiceNow]: servicenowFactory()
};

export const getExternalApprovalProviderFns = (type: string): TExternalApprovalProviderFns => {
  const fns = EXTERNAL_APPROVAL_PROVIDER_FNS[type as ExternalApprovalType];
  if (!fns) {
    throw new UnrecoverableError(`Unsupported external approval provider '${type}'`);
  }
  return fns;
};
