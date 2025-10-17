import {
  faCheck,
  faCheckCircle,
  faCircleXmark,
  faCopy,
  faKey,
  faPencil
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { NamespacePermissionCan } from "@app/components/permissions";
import { IconButton, Tag, Tooltip } from "@app/components/v2";
import { useNamespace, useUser } from "@app/context";
import {
  NamespacePermissionActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";
import { useTimedReset } from "@app/hooks";
import { namespaceUserMembershipQueryKeys } from "@app/hooks/api/namespaceUserMembership";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  userId: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["namespaceMembership"]>, data?: object) => void;
};

export const UserDetailsSection = ({ userId, handlePopUpOpen }: Props) => {
  const [copyTextUsername, isCopyingUsername, setCopyTextUsername] = useTimedReset<string>({
    initialState: "Copy username to clipboard"
  });

  const { user } = useUser();
  const currentUserId = user?.id || "";

  const { namespaceId } = useNamespace();

  const { data: membership } = useQuery(
    namespaceUserMembershipQueryKeys.detail({
      userId,
      namespaceId
    })
  );

  return membership ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">User Details</h3>
        {currentUserId !== membership.user.id && (
          <NamespacePermissionCan
            I={NamespacePermissionActions.Edit}
            a={NamespacePermissionSubjects.Member}
          >
            {(isAllowed) => {
              return (
                <Tooltip content="Edit Membership">
                  <IconButton
                    isDisabled={!isAllowed}
                    ariaLabel="edit-icon"
                    variant="plain"
                    className="group relative"
                    onClick={() => {
                      handlePopUpOpen("namespaceMembership", {
                        membershipId: membership.id,
                        metadata: membership.metadata
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={faPencil} />
                  </IconButton>
                </Tooltip>
              );
            }}
          </NamespacePermissionCan>
        )}
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Name</p>
          <p className="text-sm text-mineshaft-300">
            {membership.user.firstName || membership.user.lastName
              ? `${membership.user.firstName} ${membership.user.lastName ?? ""}`.trim()
              : "-"}
          </p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Username</p>
          <div className="group flex align-top">
            <p className="text-sm break-all text-mineshaft-300">{membership.user.username}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextUsername}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(membership.user.username);
                    setCopyTextUsername("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingUsername ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Email</p>
          <div className="flex items-center">
            <p className="mr-2 text-sm break-all text-mineshaft-300">
              {membership.user.email ?? "-"}{" "}
              <Tooltip
                content={
                  membership.user.isEmailVerified
                    ? "Email has been verified"
                    : "Email has not been verified"
                }
              >
                <FontAwesomeIcon
                  size="sm"
                  icon={membership.user.isEmailVerified ? faCheckCircle : faCircleXmark}
                  className={membership.user.isEmailVerified ? "text-green" : "text-red"}
                />
              </Tooltip>
            </p>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Last Login Auth Method</p>
          <div className="group flex align-top">
            <p className="text-sm break-all text-mineshaft-300">
              {membership.lastLoginAuthMethod || "-"}
            </p>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Last Login Time</p>
          <div className="group flex align-top">
            <p className="text-sm break-all text-mineshaft-300">
              {membership.lastLoginTime ? format(membership.lastLoginTime, "PPpp") : "-"}
            </p>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-mineshaft-300">Metadata</p>
          {membership?.metadata?.length ? (
            <div className="mt-1 flex flex-wrap gap-2 text-sm text-mineshaft-300">
              {membership.metadata?.map((el) => (
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
