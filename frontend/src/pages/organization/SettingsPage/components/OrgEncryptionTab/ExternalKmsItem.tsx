import { KeyRound, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions/OrgPermissionCan";
import {
  CopyButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context/OrgPermissionContext";
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
  const providerIcon =
    kms.externalKms.provider === ExternalKmsProvider.Aws
      ? "/images/integrations/Amazon Web Services.png"
      : "/images/integrations/Google Cloud Platform.png";

  const handleEdit = (popUpName: "editExternalKmsDetails" | "editExternalKmsCredentials") => {
    if (subscription && !subscription.externalKms) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true
      });
      return;
    }

    handlePopUpOpen(popUpName, {
      kmsId: kms.id,
      name: kms.name,
      provider: kms.externalKms.provider
    });
  };

  return (
    <TableRow key={kms.id}>
      <TableCell>
        <div className="flex items-center gap-2">
          <img src={providerIcon} alt="" className="size-5 object-contain" />
          <span className="font-medium text-foreground">
            {kms.externalKms.provider.toUpperCase()}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">{kms.name}</span>
          <CopyButton value={kms.name} ariaLabel={`Copy KMS alias ${kms.name}`} />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="max-w-80 truncate font-mono text-xs">{kms.id}</span>
          <CopyButton value={kms.id} ariaLabel={`Copy KMS ID ${kms.id}`} />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="xs" aria-label={`Actions for KMS ${kms.name}`}>
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <OrgPermissionCan I={OrgPermissionActions.Edit} an={OrgPermissionSubjects.Kms}>
              {(isAllowed) => (
                <>
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    onClick={() => handleEdit("editExternalKmsDetails")}
                  >
                    <Pencil />
                    Edit Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    onClick={() => handleEdit("editExternalKmsCredentials")}
                  >
                    <KeyRound />
                    Edit Credentials
                  </DropdownMenuItem>
                </>
              )}
            </OrgPermissionCan>
            <OrgPermissionCan I={OrgPermissionActions.Delete} an={OrgPermissionSubjects.Kms}>
              {(isAllowed) => (
                <DropdownMenuItem
                  variant="danger"
                  isDisabled={!isAllowed}
                  onClick={() =>
                    handlePopUpOpen("removeExternalKms", {
                      name: kms.name,
                      kmsId: kms.id,
                      provider: kms.externalKms.provider
                    })
                  }
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              )}
            </OrgPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
