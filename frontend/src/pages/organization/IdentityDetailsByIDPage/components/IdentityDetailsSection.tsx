import {
  faCheck,
  faChevronDown,
  faCopy,
  faEdit,
  faKey,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan } from "@app/components/permissions";
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
import { OrgPermissionIdentityActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { identityAuthToNameMap, useGetOrgIdentityMembershipById } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identityId: string;
  isOrgIdentity?: boolean;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["identity", "identityAuthMethod", "deleteIdentity"]>,
    data?: object
  ) => void;
};

export const IdentityDetailsSection = ({ identityId, handlePopUpOpen, isOrgIdentity }: Props) => {
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const { isSubOrganization } = useOrganization();

  const { data } = useGetOrgIdentityMembershipById(identityId);
  return data ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Identity Details</h3>
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
            <OrgPermissionCan
              I={OrgPermissionIdentityActions.Edit}
              a={OrgPermissionSubjects.Identity}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  className={twMerge(
                    !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                  )}
                  icon={<FontAwesomeIcon icon={faEdit} />}
                  onClick={async () => {
                    handlePopUpOpen("identity", {
                      identityId,
                      name: data.identity.name,
                      orgId: data.identity.orgId,
                      hasDeleteProtection: data.identity.hasDeleteProtection,
                      role: data.role,
                      customRole: data.customRole,
                      metadata: data.metadata
                    });
                  }}
                  disabled={!isAllowed}
                >
                  {isOrgIdentity ? "Edit Identity" : "Edit Identity Role"}
                </DropdownMenuItem>
              )}
            </OrgPermissionCan>
            <OrgPermissionCan
              I={OrgPermissionIdentityActions.Delete}
              a={OrgPermissionSubjects.Identity}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  className={twMerge(
                    isAllowed
                      ? "hover:bg-red-500! hover:text-white!"
                      : "pointer-events-none cursor-not-allowed opacity-50"
                  )}
                  onClick={async () => {
                    handlePopUpOpen("deleteIdentity", {
                      identityId,
                      name: data.identity.name
                    });
                  }}
                  icon={<FontAwesomeIcon icon={faTrash} />}
                  disabled={!isAllowed}
                >
                  {!isOrgIdentity ? "Remove From Sub-Organization" : "Delete Identity"}
                </DropdownMenuItem>
              )}
            </OrgPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-sm font-medium text-mineshaft-300">Identity ID</p>
          <div className="group flex align-top">
            <p className="text-sm text-mineshaft-300">{data.identity.id}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(data.identity.id);
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
          <p className="text-sm font-medium text-mineshaft-300">Name</p>
          <p className="text-sm text-mineshaft-300">{data.identity.name}</p>
        </div>
        {isSubOrganization && (
          <div className="mb-4">
            <p className="text-sm font-medium text-mineshaft-300">Managed By</p>
            <p className="text-sm text-mineshaft-300">
              {isOrgIdentity ? "Organization" : "Root Organization"}
            </p>
          </div>
        )}
        {isOrgIdentity && (
          <div className="mb-4">
            <p className="text-sm font-medium text-mineshaft-300">Last Login Auth Method</p>
            <p className="text-sm text-mineshaft-300">
              {data.lastLoginAuthMethod ? identityAuthToNameMap[data.lastLoginAuthMethod] : "-"}
            </p>
          </div>
        )}
        {isOrgIdentity && (
          <div className="mb-4">
            <p className="text-sm font-medium text-mineshaft-300">Last Login Time</p>
            <p className="text-sm text-mineshaft-300">
              {data.lastLoginTime ? format(data.lastLoginTime, "PPpp") : "-"}
            </p>
          </div>
        )}
        {isOrgIdentity && (
          <div className="mb-4">
            <p className="text-sm font-medium text-mineshaft-300">Delete Protection</p>
            <p className="text-sm text-mineshaft-300">
              {data.identity.hasDeleteProtection ? "On" : "Off"}
            </p>
          </div>
        )}
        <div className="mb-4">
          <p className="text-sm font-medium text-mineshaft-300">Organization Role</p>
          <p className="text-sm text-mineshaft-300">{data.role}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-mineshaft-300">Metadata</p>
          {data?.metadata?.length ? (
            <div className="mt-1 flex flex-wrap gap-2 text-sm text-mineshaft-300">
              {data.metadata?.map((el) => (
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
