import { faCheck, faCopy, faKey, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button, IconButton, Tooltip } from "@app/components/v2";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";
import { useTimedReset } from "@app/hooks";
import {
  useGetIdentityUniversalAuth,
  useGetIdentityUniversalAuthClientSecrets,
  useGetOrgIdentityMembershipById
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identityId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["clientSecret", "revokeClientSecret", "universalAuthClientSecret"]
    >,
    data?: object
  ) => void;
};

const SHOW_LIMIT = 3;

export const IdentityClientSecrets = ({ identityId, handlePopUpOpen }: Props) => {
  const [copyTextClientId, isCopyingClientId, setCopyTextClientId] = useTimedReset<string>({
    initialState: "Copy Client ID to clipboard"
  });

  const { data } = useGetOrgIdentityMembershipById(identityId);
  const { data: identityUniversalAuth } = useGetIdentityUniversalAuth(identityId);
  const { data: clientSecrets } = useGetIdentityUniversalAuthClientSecrets(identityId);
  return (
    <div>
      <div className="mb-4">
        <p className="text-sm font-medium text-mineshaft-300">Client ID</p>
        <div className="group flex align-top">
          <p className="text-sm text-mineshaft-300">{identityUniversalAuth?.clientId ?? ""}</p>
          <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <Tooltip content={copyTextClientId}>
              <IconButton
                ariaLabel="copy icon"
                variant="plain"
                className="group relative ml-2"
                onClick={() => {
                  navigator.clipboard.writeText(identityUniversalAuth?.clientId ?? "");
                  setCopyTextClientId("Copied");
                }}
              >
                <FontAwesomeIcon icon={isCopyingClientId ? faCheck : faCopy} />
              </IconButton>
            </Tooltip>
          </div>
        </div>
      </div>
      {clientSecrets?.length ? (
        <div className="flex justify-between">
          <p className="text-sm font-medium text-mineshaft-300">{`Client Secrets (${clientSecrets.length})`}</p>
          <Button
            variant="link"
            onClick={() => {
              handlePopUpOpen("universalAuthClientSecret", {
                identityId,
                name: data?.identity.name ?? ""
              });
            }}
          >
            Manage
          </Button>
        </div>
      ) : (
        <div />
      )}
      {clientSecrets
        ?.slice(0, SHOW_LIMIT)
        .map(({ id, clientSecretTTL, clientSecretPrefix, createdAt }) => {
          let expiresAt;
          if (clientSecretTTL > 0) {
            expiresAt = new Date(new Date(createdAt).getTime() + clientSecretTTL * 1000);
          }

          return (
            <div
              className="group flex items-center justify-between py-2 last:pb-0"
              key={`client-secret-${id}`}
            >
              <div className="flex items-center">
                <FontAwesomeIcon size="1x" icon={faKey} />
                <div className="ml-4">
                  <p className="text-sm font-medium text-mineshaft-300">
                    {`${clientSecretPrefix}****`}
                  </p>
                  <p className="text-sm text-mineshaft-300">
                    {expiresAt ? `Expires on ${format(expiresAt, "yyyy-MM-dd")}` : "No Expiry"}
                  </p>
                </div>
              </div>
              <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <Tooltip content="Revoke Client Secret">
                  <IconButton
                    ariaLabel="copy icon"
                    variant="plain"
                    className="group relative"
                    onClick={() => {
                      handlePopUpOpen("revokeClientSecret", {
                        clientSecretId: id,
                        clientSecretPrefix
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          );
        })}
      <OrgPermissionCan I={OrgPermissionIdentityActions.Edit} a={OrgPermissionSubjects.Identity}>
        {(isAllowed) => {
          return (
            <Button
              isDisabled={!isAllowed}
              className="mt-4 w-full"
              colorSchema="primary"
              type="submit"
              onClick={() => {
                handlePopUpOpen("clientSecret", {
                  identityId
                });
              }}
            >
              Create Client Secret
            </Button>
          );
        }}
      </OrgPermissionCan>
    </div>
  );
};
