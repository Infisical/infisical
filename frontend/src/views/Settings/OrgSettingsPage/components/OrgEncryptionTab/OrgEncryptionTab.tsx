import { faAws } from "@fortawesome/free-brands-svg-icons";
import { faEllipsis, faLock, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  THead,
  Tr,
  UpgradePlanModal
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useGetExternalKmsList, useRemoveExternalKms } from "@app/hooks/api";
import { ExternalKmsProvider } from "@app/hooks/api/kms/types";

import { AddExternalKmsForm } from "./AddExternalKmsForm";
import { UpdateExternalKmsForm } from "./UpdateExternalKmsForm";

export const OrgEncryptionTab = withPermission(
  () => {
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "upgradePlan",
      "addExternalKms",
      "editExternalKms",
      "removeExternalKms"
    ] as const);
    const { data: externalKmsList, isLoading: isExternalKmsListLoading } =
      useGetExternalKmsList(orgId);

    const { mutateAsync: removeExternalKms } = useRemoveExternalKms(currentOrg?.id!);

    const handleRemoveExternalKms = async () => {
      const { kmsId } = popUp?.removeExternalKms?.data as {
        kmsId: string;
      };

      try {
        await removeExternalKms(kmsId);

        createNotification({
          text: "Successfully deleted external KMS",
          type: "success"
        });

        handlePopUpToggle("removeExternalKms", false);
      } catch (err) {
        console.error(err);
      }
    };

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex justify-between">
          <p className="text-xl font-semibold text-mineshaft-100">Key Management System (KMS)</p>
          <Button
            onClick={() => {
              handlePopUpOpen("addExternalKms");
              // if (subscription && !subscription?.auditLogStreams) {
              //   handlePopUpOpen("upgradePlan");
              //   return;
              // }
              // handlePopUpOpen("auditLogStreamForm");
            }}
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
          >
            Add
          </Button>
        </div>
        <p className="mb-4 text-gray-400">
          Integrate with external KMS systems for encrypting your organization&apos;s data
        </p>
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Td>Provider</Td>
                <Td>Alias</Td>
              </Tr>
            </THead>
            <TBody>
              {isExternalKmsListLoading && <TableSkeleton columns={2} innerKey="kms-loading" />}
              {!isExternalKmsListLoading && externalKmsList && externalKmsList?.length === 0 && (
                <Tr>
                  <Td colSpan={5}>
                    <EmptyState title="No external KMS found" icon={faLock} />
                  </Td>
                </Tr>
              )}
              {!isExternalKmsListLoading &&
                externalKmsList?.map((kms) => (
                  <Tr key={kms.id}>
                    <Td className="flex max-w-xs items-center overflow-hidden text-ellipsis hover:overflow-auto hover:break-all">
                      {kms.externalKms.provider === ExternalKmsProvider.AWS && (
                        <FontAwesomeIcon icon={faAws} />
                      )}
                      <div className="ml-2">{kms.externalKms.provider.toUpperCase()}</div>
                    </Td>
                    <Td>{kms.slug}</Td>
                    <Td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <div className="flex justify-end hover:text-primary-400 data-[state=open]:text-primary-400">
                            <FontAwesomeIcon size="sm" icon={faEllipsis} />
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="p-1">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePopUpOpen("editExternalKms", {
                                kmsId: kms.id
                              });
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePopUpOpen("removeExternalKms", {
                                slug: kms.slug,
                                kmsId: kms.id,
                                provider: kms.externalKms.provider
                              });
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </TableContainer>
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="You can configure external KMS if you switch to Infisical's Enterprise plan."
        />
        <AddExternalKmsForm
          isOpen={popUp.addExternalKms.isOpen}
          onToggle={(state) => handlePopUpToggle("addExternalKms", state)}
        />
        <UpdateExternalKmsForm
          isOpen={popUp.editExternalKms.isOpen}
          kmsId={(popUp.editExternalKms.data as { kmsId: string })?.kmsId}
          onOpenChange={(state) => handlePopUpToggle("editExternalKms", state)}
        />
        <DeleteActionModal
          isOpen={popUp.removeExternalKms.isOpen}
          title={`Are you sure want to remove ${
            (popUp?.removeExternalKms?.data as { slug: string })?.slug || ""
          } from ${(popUp?.removeExternalKms?.data as { provider: string })?.provider || ""}?`}
          onChange={(isOpen) => handlePopUpToggle("removeExternalKms", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={handleRemoveExternalKms}
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Edit, subject: OrgPermissionSubjects.Settings }
);
