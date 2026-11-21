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
  const can = (action: OrgPermissionIdentityActions) =>
    permission.can(action, OrgPermissionSubjects.Identity);
  return (
    <SharedViewSheet
      {...props}
      gates={{
        canEditAuth: can(OrgPermissionIdentityActions.EditAuth),
        canRevokeAuth: can(OrgPermissionIdentityActions.RevokeAuth),
        canCreateToken: can(OrgPermissionIdentityActions.CreateToken),
        canDeleteToken: can(OrgPermissionIdentityActions.DeleteToken),
        canEdit: can(OrgPermissionIdentityActions.Edit)
      }}
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
