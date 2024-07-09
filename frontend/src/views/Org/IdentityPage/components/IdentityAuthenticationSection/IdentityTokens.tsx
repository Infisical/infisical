import { faEllipsis, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip
} from "@app/components/v2";
import { useGetIdentityById, useGetIdentityTokensTokenAuth } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identityId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["token", "tokenList", "revokeToken"]>,
    data?: {}
  ) => void;
};

export const IdentityTokens = ({ identityId, handlePopUpOpen }: Props) => {
  const { data } = useGetIdentityById(identityId);
  const { data: tokens } = useGetIdentityTokensTokenAuth(identityId);
  return (
    <div>
      {tokens?.length ? (
        <div className="flex justify-between">
          <p className="text-sm font-semibold text-mineshaft-300">{`Access Tokens (${tokens.length})`}</p>
          <Button
            variant="link"
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
            className="group flex items-center justify-between py-2 last:pb-0"
            key={`identity-token-${token.id}`}
          >
            <div className="flex items-center">
              <FontAwesomeIcon size="1x" icon={faKey} />
              <div className="ml-4">
                <p className="text-sm font-semibold text-mineshaft-300">
                  {token.name ? token.name : "-"}
                </p>
                <p className="text-sm text-mineshaft-300">
                  {token.isAccessTokenRevoked
                    ? "Revoked"
                    : `Expires on ${format(expiresAt, "yyyy-MM-dd")}`}
                </p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="rounded-lg">
                <div className="opacity-0 transition-opacity duration-300 hover:text-primary-400 group-hover:opacity-100 data-[state=open]:text-primary-400">
                  <Tooltip content="More options">
                    <FontAwesomeIcon size="sm" icon={faEllipsis} />
                  </Tooltip>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="p-1">
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
        colorSchema="primary"
        type="submit"
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
