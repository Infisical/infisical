import { KeyRound, Plus } from "lucide-react";

import { ExternalKmsUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useGetExternalKmsList, useRemoveExternalKms } from "@app/hooks/api";
import { ExternalKmsProvider } from "@app/hooks/api/kms/types";

import { AddExternalKmsForm } from "./AddExternalKmsForm";
import { EditExternalKmsCredentialsModal } from "./EditExternalKmsCredentialsModal";
import { EditExternalKmsDetailsModal } from "./EditExternalKmsDetailsModal";
import { ExternalKmsItem } from "./ExternalKmsItem";

type RemoveExternalKmsData = {
  kmsId: string;
  name: string;
  provider: ExternalKmsProvider;
};

export const OrgEncryptionTab = withPermission(
  () => {
    const { currentOrg, isSubOrganization } = useOrganization();
    const { subscription } = useSubscription();
    const orgId = currentOrg?.id || "";
    const { popUp, handlePopUpClose, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "upgradePlan",
      "addExternalKms",
      "editExternalKmsDetails",
      "editExternalKmsCredentials",
      "removeExternalKms"
    ] as const);
    const { data: externalKmsList, isPending: isExternalKmsListLoading } =
      useGetExternalKmsList(orgId);

    const { mutateAsync: removeExternalKms, isPending: isRemovingExternalKms } =
      useRemoveExternalKms(currentOrg.id);
    const removeExternalKmsData = popUp.removeExternalKms.data as RemoveExternalKmsData | undefined;

    const handleRemoveExternalKms = async () => {
      if (!removeExternalKmsData) return;

      try {
        await removeExternalKms({
          kmsId: removeExternalKmsData.kmsId,
          provider: removeExternalKmsData.provider
        });

        createNotification({
          text: `External KMS "${removeExternalKmsData.name}" deleted`,
          type: "success"
        });

        handlePopUpClose("removeExternalKms");
      } catch {
        createNotification({
          text: "Failed to delete external KMS",
          type: "error"
        });
      }
    };

    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            <KeyRound className="size-4 text-accent" />
            Key Management System (KMS)
          </CardTitle>
          <CardDescription>
            Encrypt your {isSubOrganization ? "sub-" : ""}organization&apos;s data with an external
            KMS.
          </CardDescription>
          <CardAction>
            <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Kms}>
              {(isAllowed) => (
                <Button
                  variant={isSubOrganization ? "sub-org" : "org"}
                  size="sm"
                  onClick={() => {
                    if (subscription && !subscription.externalKms) {
                      handlePopUpOpen("upgradePlan", {
                        isEnterpriseFeature: true
                      });
                      return;
                    }
                    handlePopUpOpen("addExternalKms");
                  }}
                  isDisabled={!isAllowed}
                >
                  <Plus />
                  Add KMS
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!isExternalKmsListLoading && (externalKmsList?.length ?? 0) === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No external KMS configured</EmptyTitle>
                <EmptyDescription>
                  Add an external KMS to encrypt organization data with a key you control.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/4">Provider</TableHead>
                  <TableHead>Alias</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead className="w-px text-right" aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isExternalKmsListLoading &&
                  Array.from({ length: 2 }).map((_, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`external-kms-skeleton-${index}`}>
                      <TableCell colSpan={4}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isExternalKmsListLoading &&
                  externalKmsList?.map((kms) => (
                    <ExternalKmsItem
                      key={kms.id}
                      kms={kms}
                      handlePopUpOpen={handlePopUpOpen}
                      subscription={subscription}
                    />
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <UpgradeGate
          paywallKey="organization.org-encryption"
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          intent={{
            ...ExternalKmsUpgradeIntent,
            isEnterpriseFeature: Boolean(popUp.upgradePlan.data?.isEnterpriseFeature)
          }}
        />
        <AddExternalKmsForm
          isOpen={popUp.addExternalKms.isOpen}
          onToggle={(state) => handlePopUpToggle("addExternalKms", state)}
        />
        <EditExternalKmsDetailsModal
          isOpen={popUp.editExternalKmsDetails.isOpen}
          kmsId={(popUp.editExternalKmsDetails.data as { kmsId: string })?.kmsId}
          provider={
            (popUp.editExternalKmsDetails.data as { provider: ExternalKmsProvider })?.provider
          }
          onOpenChange={(state) => handlePopUpToggle("editExternalKmsDetails", state)}
        />
        <EditExternalKmsCredentialsModal
          isOpen={popUp.editExternalKmsCredentials.isOpen}
          kmsId={(popUp.editExternalKmsCredentials.data as { kmsId: string })?.kmsId}
          provider={
            (popUp.editExternalKmsCredentials.data as { provider: ExternalKmsProvider })?.provider
          }
          onOpenChange={(state) => handlePopUpToggle("editExternalKmsCredentials", state)}
        />
        <ConfirmationAlertDialog
          isOpen={popUp.removeExternalKms.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("removeExternalKms", isOpen)}
          title={`Delete "${removeExternalKmsData?.name ?? "external KMS"}"`}
          description="This removes the external KMS configuration from your organization. This cannot be undone."
          confirmKey={removeExternalKmsData?.name ?? ""}
          isPending={isRemovingExternalKms}
          onConfirm={handleRemoveExternalKms}
        />
      </Card>
    );
  },
  {
    action: OrgPermissionActions.Read,
    subject: OrgPermissionSubjects.Kms,
    accessRestrictedMode: "dialog"
  }
);
