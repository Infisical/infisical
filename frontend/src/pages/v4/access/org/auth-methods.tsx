import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";

import {
  type AuthIdentity,
  AuthMethodFormSheet as SharedFormSheet,
  AuthMethodViewSheet as SharedViewSheet,
  RemoveAuthMethodDialog as SharedRemoveDialog
} from "../identity-auth/sheets";
import { useOrgId, useOrgPermission } from "../permissions";

export {
  AUTH_METHOD_ORDER,
  type AuthIdentity,
  authMethodName,
  LockBadge,
  sortedMethods
} from "../identity-auth/sheets";

export const AuthMethodFormSheet = (props: {
  identity: AuthIdentity;
  method?: IdentityAuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const organizationId = useOrgId();
  return <SharedFormSheet {...props} scope={{ organizationId }} />;
};

export const AuthMethodViewSheet = (props: {
  identity: AuthIdentity;
  method: IdentityAuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) => {
  const { permission } = useOrgPermission();
  return (
    <SharedViewSheet
      {...props}
      canEditAuth={permission.can(
        OrgPermissionIdentityActions.EditAuth,
        OrgPermissionSubjects.Identity
      )}
      canEdit={permission.can(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity)}
      canDelete={permission.can(
        OrgPermissionIdentityActions.Delete,
        OrgPermissionSubjects.Identity
      )}
    />
  );
};

export const RemoveAuthMethodDialog = (props: {
  identity: AuthIdentity;
  method?: IdentityAuthMethod;
  onClose: () => void;
}) => {
  const organizationId = useOrgId();
  return <SharedRemoveDialog {...props} scope={{ organizationId }} />;
};
