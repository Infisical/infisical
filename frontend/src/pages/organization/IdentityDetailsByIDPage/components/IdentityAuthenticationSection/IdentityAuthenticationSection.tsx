import { faCog, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";
import { IdentityAuthMethod, identityAuthToNameMap, useGetIdentityById } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identityId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["identityAuthMethod", "viewAuthMethod"]>,
    data?: object | IdentityAuthMethod
  ) => void;
};

export const IdentityAuthenticationSection = ({ identityId, handlePopUpOpen }: Props) => {
  const { data } = useGetIdentityById(identityId);

  return data ? (
    <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Authentication</h3>
      </div>
      {data.identity.authMethods.length > 0 ? (
        <div className="flex flex-col divide-y divide-mineshaft-400/50">
          {data.identity.authMethods.map((authMethod) => (
            <button
              key={authMethod}
              onClick={() => handlePopUpOpen("viewAuthMethod", authMethod)}
              type="button"
              className="flex w-full items-center justify-between bg-mineshaft-900 px-4 py-2 text-sm hover:bg-mineshaft-700 data-[state=open]:bg-mineshaft-600"
            >
              <span>{identityAuthToNameMap[authMethod]}</span>
              <FontAwesomeIcon icon={faCog} size="xs" className="text-mineshaft-400" />
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
        data.identity.authMethods.includes(method)
      ) && (
        <OrgPermissionCan I={OrgPermissionIdentityActions.Edit} a={OrgPermissionSubjects.Identity}>
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
              onClick={() => {
                handlePopUpOpen("identityAuthMethod", {
                  identityId,
                  name: data.identity.name,
                  allAuthMethods: data.identity.authMethods
                });
              }}
              variant="outline_bg"
              className="mt-3 w-full"
              size="xs"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
            >
              {data.identity.authMethods.length ? "Add" : "Create"} Auth Method
            </Button>
          )}
        </OrgPermissionCan>
      )}
    </div>
  ) : (
    <div />
  );
};
