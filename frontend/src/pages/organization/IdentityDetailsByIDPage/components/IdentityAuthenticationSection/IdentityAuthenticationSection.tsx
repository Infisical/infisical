import { faCog, faLock, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan, VariablePermissionCan } from "@app/components/permissions";
import { Button, Tooltip } from "@app/components/v2";
import {
  NamespacePermissionSubjects,
  OrgPermissionIdentityActions,
  OrgPermissionSubjects
} from "@app/context";
import { IdentityAuthMethod, identityAuthToNameMap } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { NamespacePermissionIdentityActions } from "@app/context/NamespacePermissionContext/types";

type Props = {
  identity?: {
    name: string;
    id: string;
    authMethods: IdentityAuthMethod[];
    activeLockoutAuthMethods: IdentityAuthMethod[];
    namespaceId?: string;
  };
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["identityAuthMethod", "viewAuthMethod"]>,
    data?: object | IdentityAuthMethod
  ) => void;
};

export const IdentityAuthenticationSection = ({ handlePopUpOpen, identity }: Props) => {
  return identity ? (
    <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Authentication</h3>
      </div>
      {identity.authMethods.length > 0 ? (
        <div className="flex flex-col divide-y divide-mineshaft-400/50">
          {identity.authMethods.map((authMethod) => (
            <button
              key={authMethod}
              onClick={() =>
                handlePopUpOpen("viewAuthMethod", {
                  authMethod,
                  lockedOut: identity?.activeLockoutAuthMethods?.includes(authMethod)
                })
              }
              type="button"
              className="flex w-full items-center justify-between bg-mineshaft-900 px-4 py-2 text-sm hover:bg-mineshaft-700 data-[state=open]:bg-mineshaft-600"
            >
              <span>{identityAuthToNameMap?.[authMethod]}</span>
              <div className="flex gap-2">
                {identity.activeLockoutAuthMethods.includes(authMethod) && (
                  <Tooltip content="Auth method has active lockouts">
                    <FontAwesomeIcon icon={faLock} size="xs" className="text-red-400/50" />
                  </Tooltip>
                )}
                <FontAwesomeIcon icon={faCog} size="xs" className="text-mineshaft-400" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="w-full space-y-2 pt-2">
          <p className="text-sm text-mineshaft-300">
            No authentication methods configured. Get started by creating a new auth method.
          </p>
        </div>
      )}
      {!Object.values(IdentityAuthMethod).every((method) =>
        identity.authMethods.includes(method)
      ) && (
        <VariablePermissionCan
          type={identity?.namespaceId ? "namespace" : "org"}
          I={
            identity?.namespaceId
              ? NamespacePermissionIdentityActions.Edit
              : OrgPermissionIdentityActions.Edit
          }
          a={
            identity?.namespaceId
              ? NamespacePermissionSubjects.Identity
              : OrgPermissionSubjects.Identity
          }
        >
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
              onClick={() => {
                handlePopUpOpen("identityAuthMethod", {
                  identityId: identity.id,
                  name: identity.name,
                  allAuthMethods: identity.authMethods
                });
              }}
              variant="outline_bg"
              className="mt-3 w-full"
              size="xs"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
            >
              {identity.authMethods.length ? "Add" : "Create"} Auth Method
            </Button>
          )}
        </VariablePermissionCan>
      )}
    </div>
  ) : (
    <div />
  );
};
