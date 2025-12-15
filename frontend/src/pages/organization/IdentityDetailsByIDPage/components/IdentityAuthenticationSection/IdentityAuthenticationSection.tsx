import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";
import { IdentityAuthMethod, useGetOrgIdentityMembershipById } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { ViewIdentityAuth } from "../ViewIdentityAuth";

type Props = {
  identityId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["identityAuthMethod", "viewAuthMethod"]>,
    data?: object | IdentityAuthMethod
  ) => void;
};

export const IdentityAuthenticationSection = ({ identityId, handlePopUpOpen }: Props) => {
  const { data, refetch } = useGetOrgIdentityMembershipById(identityId);

  return data ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Authentication</h3>
        {!Object.values(IdentityAuthMethod).every((method) =>
          data.identity.authMethods.includes(method)
        ) && (
          <OrgPermissionCan
            I={OrgPermissionIdentityActions.Edit}
            a={OrgPermissionSubjects.Identity}
          >
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
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
              >
                {data.identity.authMethods.length ? "Add" : "Create"} Auth Method
              </Button>
            )}
          </OrgPermissionCan>
        )}
      </div>
      {data.identity.authMethods.length > 0 ? (
        <ViewIdentityAuth
          activeLockoutAuthMethods={data.identity.activeLockoutAuthMethods}
          identityId={identityId}
          authMethods={data.identity.authMethods}
          onResetAllLockouts={refetch}
        />
      ) : (
        <div className="w-full space-y-2 pt-2">
          <p className="text-sm text-mineshaft-300">
            No authentication methods configured. Get started by creating a new auth method.
          </p>
        </div>
      )}
    </div>
  ) : (
    <div />
  );
};
