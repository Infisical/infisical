import { ExternalApprovalPolicyType } from "./external-approval-enums";
import { EXTERNAL_APPROVAL_CONNECTION_MAP, EXTERNAL_APPROVAL_NAME_MAP } from "./external-approval-maps";
import { TExternalApprovalListItem } from "./external-approval-types";

export const listExternalApprovalOptions = (): TExternalApprovalListItem[] =>
  Object.values(ExternalApprovalPolicyType)
    .map((type) => ({
      name: EXTERNAL_APPROVAL_NAME_MAP[type],
      type,
      connection: EXTERNAL_APPROVAL_CONNECTION_MAP[type]
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
