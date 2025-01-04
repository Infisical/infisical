import { useEffect } from "react";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button, IconButton, Select, SelectItem, Tooltip } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { useGetIdentityById } from "@app/hooks/api";
import { IdentityAuthMethod, identityAuthToNameMap } from "@app/hooks/api/identities";
import { Identity } from "@app/hooks/api/identities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityClientSecrets } from "./IdentityClientSecrets";
import { IdentityTokens } from "./IdentityTokens";

type Props = {
  identityId: string;
  setSelectedAuthMethod: (authMethod: Identity["authMethods"][number] | null) => void;
  selectedAuthMethod: Identity["authMethods"][number] | null;
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

export const IdentityAuthenticationSection = ({
  identityId,
  setSelectedAuthMethod,
  selectedAuthMethod,
  handlePopUpOpen
}: Props) => {
  const { data } = useGetIdentityById(identityId);

  useEffect(() => {
    if (!data?.identity) return;

    if (data.identity.authMethods?.length) {
      setSelectedAuthMethod(data.identity.authMethods[0]);
    }

    // eslint-disable-next-line consistent-return
    return () => setSelectedAuthMethod(null);
  }, [data?.identity]);

  return data ? (
    <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Authentication</h3>

        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Identity}>
          {(isAllowed) => {
            return (
              <Tooltip content="Add new auth method">
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative"
                  onClick={() =>
                    handlePopUpOpen("identityAuthMethod", {
                      identityId,
                      name: data.identity.name,
                      allAuthMethods: data.identity.authMethods
                    })
                  }
                >
                  <FontAwesomeIcon icon={faPlus} />
                </IconButton>
              </Tooltip>
            );
          }}
        </OrgPermissionCan>
      </div>
      {data.identity.authMethods.length > 0 ? (
        <>
          <div className="py-4">
            <div className="flex justify-between">
              <p className="ml-px mb-0.5 text-sm font-semibold text-mineshaft-300">Auth Method</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-full">
                <Select
                  className="w-full"
                  value={selectedAuthMethod as string}
                  onValueChange={(value) => setSelectedAuthMethod(value as IdentityAuthMethod)}
                >
                  {(data.identity?.authMethods || []).map((authMethod) => (
                    <SelectItem key={authMethod || authMethod} value={authMethod}>
                      {identityAuthToNameMap[authMethod]}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                <Tooltip content="Edit auth method">
                  <IconButton
                    onClick={() => {
                      handlePopUpOpen("identityAuthMethod", {
                        identityId,
                        name: data.identity.name,
                        authMethod: selectedAuthMethod,
                        allAuthMethods: data.identity.authMethods
                      });
                    }}
                    ariaLabel="copy icon"
                    variant="plain"
                    className="group relative"
                  >
                    <FontAwesomeIcon icon={faPencil} />
                  </IconButton>
                </Tooltip>{" "}
              </div>
            </div>
          </div>
          {selectedAuthMethod === IdentityAuthMethod.UNIVERSAL_AUTH && (
            <IdentityClientSecrets identityId={identityId} handlePopUpOpen={handlePopUpOpen} />
          )}
          {selectedAuthMethod === IdentityAuthMethod.TOKEN_AUTH && (
            <IdentityTokens identityId={identityId} handlePopUpOpen={handlePopUpOpen} />
          )}
        </>
      ) : (
        <div className="w-full space-y-2 pt-2">
          <p className="text-sm text-mineshaft-300">
            No authentication methods configured. Get started by creating a new auth method.
          </p>
          <Button
            onClick={() => {
              handlePopUpOpen("identityAuthMethod", {
                identityId,
                name: data.identity.name,
                allAuthMethods: data.identity.authMethods
              });
            }}
            variant="outline_bg"
            className="w-full"
            size="xs"
          >
            Create Auth Method
          </Button>
        </div>
      )}
    </div>
  ) : (
    <div />
  );
};
