import { faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  IconButton,
  // Button,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { useGetIdentityById } from "@app/hooks/api";
import { IdentityAuthMethod, identityAuthToNameMap } from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityClientSecrets } from "./IdentityClientSecrets";
import { IdentityTokens } from "./IdentityTokens";

type Props = {
  identityId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      [
        "clientSecret",
        "identityAuthMethod",
        "revokeClientSecret",
        "token",
        "revokeToken",
        "universalAuthClientSecret",
        "tokenList"
      ]
    >,
    data?: {}
  ) => void;
};

export const IdentityAuthenticationSection = ({ identityId, handlePopUpOpen }: Props) => {
  const { data } = useGetIdentityById(identityId);
  return data ? (
    <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Authentication</h3>
        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Identity}>
          {(isAllowed) => {
            return (
              <Tooltip content={`${data.identity.authMethod ? "Edit" : "Configure"} Auth Method`}>
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative"
                  onClick={() =>
                    handlePopUpOpen("identityAuthMethod", {
                      identityId,
                      name: data.identity.name,
                      authMethod: data.identity.authMethod
                    })
                  }
                >
                  <FontAwesomeIcon icon={faPencil} />
                </IconButton>
              </Tooltip>
            );
          }}
        </OrgPermissionCan>
      </div>
      <div className="py-4">
        <div className="flex justify-between">
          <p className="text-sm font-semibold text-mineshaft-300">Auth Method</p>
          {/* <Button
            variant="link"
            onClick={() => {
              handlePopUpOpen("identityAuthMethod", {
                identityId,
                name: data.identity.name,
                authMethod: data.identity.authMethod
              });
            }}
          >
            Manage
          </Button> */}
        </div>
        <p className="text-sm text-mineshaft-300">
          {data.identity.authMethod
            ? identityAuthToNameMap[data.identity.authMethod]
            : "Not configured"}
        </p>
      </div>
      {data.identity.authMethod === IdentityAuthMethod.UNIVERSAL_AUTH && (
        <IdentityClientSecrets identityId={identityId} handlePopUpOpen={handlePopUpOpen} />
      )}
      {data.identity.authMethod === IdentityAuthMethod.TOKEN_AUTH && (
        <IdentityTokens identityId={identityId} handlePopUpOpen={handlePopUpOpen} />
      )}
    </div>
  ) : (
    <div />
  );
};
