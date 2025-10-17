import {
  faCheck,
  faChevronDown,
  faCopy,
  faEdit,
  faKey,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { NamespacePermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tag,
  Tooltip
} from "@app/components/v2";
import {
  NamespacePermissionIdentityActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";
import { useTimedReset } from "@app/hooks";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identity?: {
    id: string;
    name: string;
    hasDeleteProtection?: boolean;
    metadata?: Array<{ key: string; value: string; id: string }>;
  };
  isNamespaceScope?: boolean;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["identity", "identityAuthMethod", "deleteIdentity"]>,
    data?: object
  ) => void;
};

export const IdentityDetailsSection = ({ identity, handlePopUpOpen, isNamespaceScope }: Props) => {
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  return identity ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Identity Details</h3>
        {isNamespaceScope && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="xs"
                rightIcon={
                  <FontAwesomeIcon
                    className="ml-1 transition-transform duration-200 group-data-[state=open]:rotate-180"
                    icon={faChevronDown}
                  />
                }
                colorSchema="secondary"
                className="group select-none"
              >
                Options
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="mt-3 min-w-[120px]" align="end">
              <NamespacePermissionCan
                I={NamespacePermissionIdentityActions.Edit}
                a={NamespacePermissionSubjects.Identity}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    className={twMerge(
                      !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                    )}
                    icon={<FontAwesomeIcon icon={faEdit} />}
                    onClick={async () => {
                      handlePopUpOpen("identity", {
                        identityId: identity.id,
                        name: identity.name,
                        hasDeleteProtection: identity.hasDeleteProtection
                      });
                    }}
                    disabled={!isAllowed}
                  >
                    Edit Identity
                  </DropdownMenuItem>
                )}
              </NamespacePermissionCan>
              <NamespacePermissionCan
                I={NamespacePermissionIdentityActions.Delete}
                a={NamespacePermissionSubjects.Identity}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    className={twMerge(
                      isAllowed
                        ? "hover:!bg-red-500 hover:!text-white"
                        : "pointer-events-none cursor-not-allowed opacity-50"
                    )}
                    onClick={async () => {
                      handlePopUpOpen("deleteIdentity", {
                        identityId: identity.id,
                        name: identity.name
                      });
                    }}
                    icon={<FontAwesomeIcon icon={faTrash} />}
                    disabled={!isAllowed}
                  >
                    Delete Identity
                  </DropdownMenuItem>
                )}
              </NamespacePermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Identity ID</p>
          <div className="group flex align-top">
            <p className="text-sm text-mineshaft-300">{identity.id}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(identity.id);
                    setCopyTextId("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingId ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Name</p>
          <p className="text-sm text-mineshaft-300">{identity.name}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Last Login Auth Method</p>
          <p className="text-sm text-mineshaft-300">-</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Last Login Time</p>
          <p className="text-sm text-mineshaft-300">-</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Delete Protection</p>
          <p className="text-sm text-mineshaft-300">
            {identity.hasDeleteProtection ? "On" : "Off"}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-mineshaft-300">Metadata</p>
          {identity?.metadata?.length ? (
            <div className="mt-1 flex flex-wrap gap-2 text-sm text-mineshaft-300">
              {identity.metadata?.map((el) => (
                <div key={el.id} className="flex items-center">
                  <Tag
                    size="xs"
                    className="mr-0 flex items-center rounded-r-none border border-mineshaft-500"
                  >
                    <FontAwesomeIcon icon={faKey} size="xs" className="mr-1" />
                    <div>{el.key}</div>
                  </Tag>
                  <Tag
                    size="xs"
                    className="flex items-center rounded-l-none border border-mineshaft-500 bg-mineshaft-900 pl-1"
                  >
                    <div className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                      {el.value}
                    </div>
                  </Tag>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-mineshaft-300">-</p>
          )}
        </div>
      </div>
    </div>
  ) : (
    <div />
  );
};
