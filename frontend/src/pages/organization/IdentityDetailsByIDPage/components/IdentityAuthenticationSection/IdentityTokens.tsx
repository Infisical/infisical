import { faEllipsisVertical, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip
} from "@app/components/v2";
import { useGetIdentityTokensTokenAuth, useGetOrgIdentityMembershipById } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identityId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["token", "tokenList", "revokeToken"]>,
    data?: object
  ) => void;
};

export const IdentityTokens = ({ identityId, handlePopUpOpen }: Props) => {
  const { data } = useGetOrgIdentityMembershipById(identityId);
  const { data: tokens } = useGetIdentityTokensTokenAuth(identityId);
  return (
    <div>
      {tokens?.length ? (
        <div className="flex items-center justify-between border-b border-bunker-400 pb-1">
          <p className="text-sm font-medium text-bunker-300">{`Access Tokens (${tokens.length})`}</p>
          <Button
            size="xs"
            className="underline"
            variant="plain"
            colorSchema="secondary"
            onClick={() => {
              handlePopUpOpen("tokenList", {
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
      {tokens?.map((token) => {
        const expiresAt = new Date(
          new Date(token.createdAt).getTime() + token.accessTokenMaxTTL * 1000
        );
        return (
          <div
            className="group flex items-center justify-between border-b border-mineshaft-500 px-2 py-2 last:pb-0"
            key={`identity-token-${token.id}`}
          >
            <div className="flex items-center">
              <FontAwesomeIcon size="xs" className="text-mineshaft-400" icon={faKey} />
              <div className="ml-3">
                <p className="text-sm font-medium text-mineshaft-300">
                  {token.name ? token.name : "-"}
                </p>
                <p className="text-xs text-mineshaft-400">
                  {token.isAccessTokenRevoked
                    ? "Revoked"
                    : `Expires on ${format(expiresAt, "yyyy-MM-dd")}`}
                </p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Tooltip side="right" content="More options">
                  <IconButton
                    colorSchema="secondary"
                    variant="plain"
                    size="xs"
                    ariaLabel="More options"
                  >
                    <FontAwesomeIcon icon={faEllipsisVertical} />
                  </IconButton>
                </Tooltip>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="z-101 p-1">
                <DropdownMenuItem
                  onClick={async () => {
                    handlePopUpOpen("token", {
                      identityId,
                      tokenId: token.id,
                      name: token.name
                    });
                  }}
                >
                  Edit Token
                </DropdownMenuItem>
                {!token.isAccessTokenRevoked && (
                  <DropdownMenuItem
                    onClick={async () => {
                      handlePopUpOpen("revokeToken", {
                        identityId,
                        tokenId: token.id,
                        name: token.name
                      });
                    }}
                  >
                    Revoke Token
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
      <Button
        className="mt-4 mr-4 w-full"
        colorSchema="secondary"
        type="submit"
        size="xs"
        onClick={() => {
          handlePopUpOpen("token", {
            identityId
          });
        }}
      >
        Create Token
      </Button>
    </div>
  );
};
