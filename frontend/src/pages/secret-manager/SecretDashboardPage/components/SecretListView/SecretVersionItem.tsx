import { useState } from "react";
import { faEye } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowRotateRight,
  faBan,
  faDesktop,
  faEyeSlash,
  faLock,
  faServer,
  faTrash,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, IconButton, Tooltip } from "@app/components/v2";
import { useProject } from "@app/context";
import { usePopUp } from "@app/hooks";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { fetchSecretVersionValue } from "@app/hooks/api/secrets/queries";
import { SecretV3RawSanitized, SecretVersions } from "@app/hooks/api/secrets/types";

interface SecretVersionItemProps {
  secretVersion: SecretVersions;
  secret: SecretV3RawSanitized;
  currentVersion: number;
  onRevert: (secretValue: string) => void;
  onRedactSecretValue: (versionId: string) => Promise<void>;
  canReadValue: boolean;
  canEditSecret: boolean;
}

export const SecretVersionItem = ({
  secretVersion: {
    createdAt,
    version,
    actor,
    secretValueHidden,
    id: versionId,
    isRedacted,
    redactedAt,
    redactedByActor
  },
  secret,
  currentVersion,
  onRevert,
  onRedactSecretValue,
  canReadValue,
  canEditSecret
}: SecretVersionItemProps) => {
  const { currentProject } = useProject();

  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["redactSecretValue"] as const);

  const navigate = useNavigate();

  const getModifiedByIcon = (userType: string | undefined | null) => {
    switch (userType) {
      case ActorType.USER:
        return faUser;
      case ActorType.IDENTITY:
        return faDesktop;
      default:
        return faServer;
    }
  };

  const getModifiedByName = (
    userType: string | undefined | null,
    userName: string | null | undefined
  ) => {
    switch (userType) {
      case ActorType.PLATFORM:
        return "System-generated";
      case ActorType.IDENTITY:
        return userName || "Deleted Identity";
      case ActorType.USER:
        return userName || "Deleted User";
      default:
        return "Unknown";
    }
  };

  const getLinkToModifyHistoryEntity = (
    actorId: string,
    actorType: string,
    membershipId: string | null = "",
    groupId: string | null = "",
    actorName: string | null = ""
  ) => {
    switch (actorType) {
      case ActorType.USER:
        if (groupId)
          return `/projects/secret-management/${currentProject.id}/groups/${groupId}?username=${actorName}`;
        return `/projects/secret-management/${currentProject.id}/members/${membershipId}`;
      case ActorType.IDENTITY:
        return `/projects/secret-management/${currentProject.id}/identities/${actorId}`;
      default:
        return null;
    }
  };

  const onModifyHistoryClick = (
    actorId: string | undefined | null,
    actorType: string | undefined | null,
    membershipId: string | undefined | null,
    groupId: string | undefined | null,
    actorName: string | undefined | null
  ) => {
    if (!membershipId) {
      createNotification({
        type: "info",
        text: `This ${actorType === ActorType.USER ? "user" : "identity"} is no longer a member of this project.`
      });
      return;
    }

    if (actorType && actorId && actorType !== ActorType.PLATFORM) {
      const redirectLink = getLinkToModifyHistoryEntity(
        actorId,
        actorType,
        membershipId,
        groupId,
        actorName
      );
      if (redirectLink) {
        navigate({ to: redirectLink });
      }
    }
  };

  const [secretValue, setSecretValue] = useState<string | null>(null);
  const [isFetchingValue, setIsFetchingValue] = useState(false);
  const handleGetSecretValue = async () => {
    if (secretValue) return secretValue;
    try {
      setIsFetchingValue(true);
      const value = await fetchSecretVersionValue(secret.id, version);
      setSecretValue(value);
      return value;
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to fetch secret version value"
      });
      throw e;
    } finally {
      setIsFetchingValue(false);
    }
  };

  const handleCopyValue = async (
    e: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>
  ) => {
    const value = await handleGetSecretValue();
    navigator.clipboard.writeText(value || "");
    const target = e.currentTarget;
    target.style.borderBottom = "1px dashed";
    target.style.paddingBottom = "-1px";

    // Create and insert popup
    const popup = document.createElement("div");
    popup.className =
      "w-16 flex justify-center absolute top-6 left-0 text-xs text-primary-100 bg-mineshaft-800 px-1 py-0.5 rounded-md border border-primary-500/50";
    popup.textContent = "Copied!";
    target.parentElement?.appendChild(popup);

    // Remove popup and border after delay
    setTimeout(() => {
      popup.remove();
      target.style.borderBottom = "none";
    }, 3000);
  };

  return (
    <>
      <DeleteActionModal
        isOpen={popUp.redactSecretValue.isOpen}
        onChange={(isOpen) => handlePopUpToggle("redactSecretValue", isOpen)}
        onDeleteApproved={async () => {
          await onRedactSecretValue(versionId);

          handlePopUpToggle("redactSecretValue", false);
        }}
        deleteKey="confirm"
        title={`Are you sure you want to redact the secret value on version ${version}? This action is irreversible.`}
      />
      <div className={twMerge("flex flex-row", isRedacted && "opacity-100")}>
        <div className="flex w-full flex-col space-y-1">
          <div className="flex items-center">
            <div className="w-10">
              <div
                className={twMerge(
                  "w-fit rounded-md border border-mineshaft-600 px-1 text-sm text-mineshaft-300",
                  isRedacted ? "bg-red-500/30" : "bg-mineshaft-700"
                )}
              >
                v{version}
              </div>
            </div>
            <div>{format(new Date(createdAt), "Pp")}</div>
          </div>
          <div className="flex w-full cursor-default">
            <div className="relative w-10">
              <div className="absolute top-0 bottom-0 left-3 mt-0.5 border-l border-mineshaft-400/60" />
            </div>
            <div className="flex w-full cursor-default flex-col">
              {actor && (
                <div className="flex flex-row">
                  <div className="flex w-fit flex-row text-sm">
                    Modified by:
                    <Tooltip
                      className="z-[100] max-w-sm"
                      content={
                        getModifiedByName(actor.actorType, actor.name) +
                        (!actor.membershipId && actor.actorId ? " (Removed from project)" : "")
                      }
                    >
                      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                      <div
                        onClick={
                          actor.membershipId
                            ? () =>
                                onModifyHistoryClick(
                                  actor.actorId,
                                  actor.actorType,
                                  actor.membershipId,
                                  actor.groupId,
                                  actor.name
                                )
                            : undefined
                        }
                        className={actor.membershipId ? "cursor-pointer" : undefined}
                      >
                        <FontAwesomeIcon
                          icon={getModifiedByIcon(actor.actorType)}
                          className="ml-2"
                        />
                        {!actor.membershipId &&
                          actor.actorType &&
                          [ActorType.USER, ActorType.IDENTITY].includes(
                            actor.actorType as ActorType
                          ) && <FontAwesomeIcon className="ml-1 text-mineshaft-400" icon={faBan} />}
                      </div>
                    </Tooltip>
                  </div>
                </div>
              )}
              <div className="flex flex-row">
                <div className="h-min w-fit rounded-xs bg-primary-500/10 px-1 text-primary-300/70">
                  Value:
                </div>
                {!isRedacted ? (
                  <div className="group pl-1 font-mono break-all">
                    <div className="relative hidden cursor-pointer transition-all duration-200 group-[.show-value]:inline">
                      <button
                        type="button"
                        className="text-left select-none"
                        onClick={async (e) => {
                          if (secretValueHidden) return;

                          await handleCopyValue(e);
                        }}
                        onKeyDown={async (e) => {
                          if (secretValueHidden) return;

                          if (e.key === "Enter" || e.key === " ") {
                            await handleCopyValue(e);
                          }
                        }}
                      >
                        <span
                          className={twMerge(
                            secretValueHidden && "text-xs text-bunker-300 opacity-40"
                          )}
                        >
                          {/* eslint-disable-next-line no-nested-ternary */}
                          {secretValueHidden
                            ? "Hidden"
                            : isFetchingValue
                              ? "****"
                              : ((secretValue || (
                                  <span className="text-mineshaft-400">EMPTY</span>
                                )) ??
                                "Error fetching secret value...")}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="ml-1 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.currentTarget.closest(".group")?.classList.remove("show-value");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            e.currentTarget.closest(".group")?.classList.remove("show-value");
                          }
                        }}
                      >
                        <FontAwesomeIcon icon={faEyeSlash} />
                      </button>
                    </div>
                    <span className="group-[.show-value]:hidden">
                      ****
                      <button
                        type="button"
                        className="ml-1 cursor-pointer"
                        onClick={async (e) => {
                          e.currentTarget.closest(".group")?.classList.add("show-value");
                          await handleGetSecretValue();
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.currentTarget.closest(".group")?.classList.add("show-value");
                            await handleGetSecretValue();
                          }
                        }}
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center pl-1 font-mono break-all">
                    <div className="relative transition-all duration-200">
                      <Tooltip
                        className="z-[100] max-w-sm"
                        content={
                          <div>
                            <div className="flex items-center gap-2 text-red-500/70">
                              <span className="text-xs">Redacted</span>
                              <FontAwesomeIcon icon={faLock} />
                            </div>

                            <div className="text-xs text-bunker-300">
                              Redacted by{" "}
                              <b>
                                {!redactedByActor?.projectMembershipId
                                  ? `${redactedByActor?.username} (Removed from project)`
                                  : redactedByActor.username ||
                                    redactedByActor.email ||
                                    "Unknown User"}
                              </b>{" "}
                              {redactedAt && (
                                <span className="text-xs">
                                  on {format(new Date(redactedAt || ""), "Pp")}
                                </span>
                              )}
                            </div>
                          </div>
                        }
                      >
                        <div className="flex gap-2">
                          <span className="text-xs text-red-500/70">Redacted</span>
                          <FontAwesomeIcon icon={faLock} />
                        </div>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!secret?.isRotatedSecret && canReadValue && (
            <div
              className={`flex items-center justify-center ${version === currentVersion ? "hidden" : ""}`}
            >
              <Tooltip content="Restore Secret Value">
                <IconButton
                  ariaLabel="Restore"
                  variant="outline_bg"
                  size="sm"
                  className="h-8 w-8 rounded-md"
                  onClick={async () => {
                    if (secretValue) {
                      onRevert(secretValue);
                      return;
                    }

                    const value = await handleGetSecretValue();

                    onRevert(value);
                  }}
                >
                  <FontAwesomeIcon icon={faArrowRotateRight} />
                </IconButton>
              </Tooltip>
            </div>
          )}

          {!secret?.isRotatedSecret && canEditSecret && !isRedacted && (
            <div
              className={`flex items-center justify-center ${version === currentVersion ? "hidden" : ""}`}
            >
              <Tooltip content="Redact Secret Value">
                <IconButton
                  ariaLabel="Redact"
                  variant="outline_bg"
                  size="sm"
                  className="h-8 w-8 rounded-md"
                  onClick={() => handlePopUpOpen("redactSecretValue")}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
