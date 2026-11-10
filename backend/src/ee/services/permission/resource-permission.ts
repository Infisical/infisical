import { MongoAbility } from "@casl/ability";

import {
  ApplicationApprovalPolicyPermissionActions,
  ApplicationCertificatePermissionActions,
  ApplicationEnrollmentPermissionActions,
  ApplicationPermissionActions,
  ApplicationPermissionSet,
  ApplicationPermissionSub,
  ApplicationPkiSyncPermissionActions
} from "@app/domains/certificates/cert-manager/ce/module";
import {
  SignerPermissionActions,
  SignerPermissionSet,
  SignerPermissionSub
} from "@app/domains/certificates/code-signing/ce/module";
import {
  PamResourcePermissionActions,
  PamResourcePermissionSet,
  PamResourcePermissionSub
} from "@app/domains/pam/pam/ce/module";

// Each resource subject now belongs to its product (Cert Manager, Code Signing, PAM). These names keep the
// combined set getResourcePermission returns until each product's own permission function replaces it.
export const ResourcePermissionSub = {
  ...ApplicationPermissionSub,
  ...SignerPermissionSub,
  ...PamResourcePermissionSub
} as const;
export type ResourcePermissionSub = (typeof ResourcePermissionSub)[keyof typeof ResourcePermissionSub];

export {
  ApplicationApprovalPolicyPermissionActions as ResourcePermissionApprovalPolicyActions,
  ApplicationCertificatePermissionActions as ResourcePermissionCertificateActions,
  ApplicationEnrollmentPermissionActions as ResourcePermissionApplicationEnrollmentActions,
  ApplicationPermissionActions as ResourcePermissionApplicationActions,
  ApplicationPkiSyncPermissionActions as ResourcePermissionPkiSyncActions,
  PamResourcePermissionActions as ResourcePermissionPamResourceActions,
  SignerPermissionActions as ResourcePermissionSignerActions
};

export type ResourcePermissionSet = ApplicationPermissionSet | SignerPermissionSet | PamResourcePermissionSet;

export type TResourceAbility = MongoAbility<ResourcePermissionSet>;
