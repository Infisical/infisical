import { faAws, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faCheck, faCopy, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions/OrgPermissionCan";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2/Dropdown";
import { IconButton } from "@app/components/v2/IconButton";
import { Td, Tr } from "@app/components/v2/Table";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context/OrgPermissionContext";
import { useToggle } from "@app/hooks";
import { ExternalKmsProvider, KmsListEntry } from "@app/hooks/api/kms/types";
import { SubscriptionPlan } from "@app/hooks/api/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  kms: KmsListEntry;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["editExternalKmsDetails", "editExternalKmsCredentials", "removeExternalKms", "upgradePlan"]
    >,
    data?: {
      kmsId?: string;
      name?: string;
      provider?: string;
      isEnterpriseFeature?: boolean;
    }
  ) => void;
  subscription: SubscriptionPlan;
};

export const ExternalKmsItem = ({ kms, handlePopUpOpen, subscription }: Props) => {
  const [isKmsIdCopied, { timedToggle: toggleKmsIdCopied }] = useToggle(false);
  const [isKmsAliasCopied, { timedToggle: toggleKmsAliasCopied }] = useToggle(false);

  return (
    <Tr key={kms.id}>
      <Td className="flex max-w-xs items-center overflow-hidden text-ellipsis hover:overflow-auto hover:break-all">
        {kms.externalKms.provider === ExternalKmsProvider.Aws && <FontAwesomeIcon icon={faAws} />}
        {kms.externalKms.provider === ExternalKmsProvider.Gcp && (
          <FontAwesomeIcon icon={faGoogle} />
        )}
        <div className="ml-2">{kms.externalKms.provider.toUpperCase()}</div>
      </Td>
      <Td>
        <div className="group flex items-center gap-2">
          {kms.name}
          <IconButton
            size="xs"
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="relative rounded-md opacity-0 group-hover:opacity-100"
            onClick={() => {
              if (isKmsAliasCopied) {
                return;
              }
              navigator.clipboard.writeText(kms.name);
              createNotification({
                text: "KMS alias copied to clipboard",
                type: "success"
              });
              toggleKmsAliasCopied(2000);
            }}
          >
            <FontAwesomeIcon icon={isKmsAliasCopied ? faCheck : faCopy} />
          </IconButton>
        </div>
      </Td>
      <Td>
        <div className="group flex items-center gap-2">
          {kms.id}
          <IconButton
            size="xs"
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="relative rounded-md opacity-0 group-hover:opacity-100"
            onClick={() => {
              if (isKmsIdCopied) {
                return;
              }
              navigator.clipboard.writeText(kms.id);
              createNotification({
                text: "KMS ID copied to clipboard",
                type: "success"
              });
              toggleKmsIdCopied(2000);
            }}
          >
            <FontAwesomeIcon icon={isKmsIdCopied ? faCheck : faCopy} />
          </IconButton>
        </div>
      </Td>
      <Td>
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="rounded-lg">
            <div className="flex justify-end hover:text-primary-400 data-[state=open]:text-primary-400">
              <FontAwesomeIcon size="sm" icon={faEllipsis} />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-1">
            <OrgPermissionCan I={OrgPermissionActions.Edit} an={OrgPermissionSubjects.Kms}>
              {(isAllowed) => (
                <>
                  <DropdownMenuItem
                    disabled={!isAllowed}
                    className={twMerge(
                      !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (subscription && !subscription?.externalKms) {
                        handlePopUpOpen("upgradePlan", {
                          isEnterpriseFeature: true
                        });
                        return;
                      }

                      handlePopUpOpen("editExternalKmsDetails", {
                        kmsId: kms.id,
                        provider: kms.externalKms.provider
                      });
                    }}
                  >
                    Edit Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!isAllowed}
                    className={twMerge(
                      !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (subscription && !subscription?.externalKms) {
                        handlePopUpOpen("upgradePlan", {
                          isEnterpriseFeature: true
                        });
                        return;
                      }

                      handlePopUpOpen("editExternalKmsCredentials", {
                        kmsId: kms.id,
                        provider: kms.externalKms.provider
                      });
                    }}
                  >
                    Edit Credentials
                  </DropdownMenuItem>
                </>
              )}
            </OrgPermissionCan>
            <OrgPermissionCan I={OrgPermissionActions.Delete} an={OrgPermissionSubjects.Kms}>
              {(isAllowed) => (
                <DropdownMenuItem
                  disabled={!isAllowed}
                  className={twMerge(
                    !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("removeExternalKms", {
                      name: kms.name,
                      kmsId: kms.id,
                      provider: kms.externalKms.provider
                    });
                  }}
                >
                  Delete
                </DropdownMenuItem>
              )}
            </OrgPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
    </Tr>
  );
};
