import { useEffect, useState } from "react";
import { faCertificate, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Checkbox,
  DeleteActionModal,
  EmptyState,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
  MachineAuthTemplateUsage,
  TEMPLATE_ERROR_MESSAGES,
  TEMPLATE_UI_LABELS,
  useGetTemplateUsages,
  useUnlinkTemplateUsage
} from "@app/hooks/api/identityAuthTemplates";
import { usePopUp } from "@app/hooks/usePopUp";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  templateName: string;
};

export const MachineAuthTemplateUsagesModal = ({
  isOpen,
  onClose,
  templateId,
  templateName
}: Props) => {
  const { currentOrg } = useOrganization();
  const [selectedUsageIds, setSelectedUsageIds] = useState<string[]>([]);

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "unlinkUsages"
  ] as const);

  useEffect(() => {
    if (!isOpen) {
      setSelectedUsageIds([]);
      handlePopUpClose("unlinkUsages");
    }
  }, [isOpen, handlePopUpClose]);

  const organizationId = currentOrg?.id || "";

  const {
    data: usages = [],
    isPending,
    refetch
  } = useGetTemplateUsages({
    templateId,
    organizationId
  });

  const { mutateAsync: unlinkUsage } = useUnlinkTemplateUsage();

  const handleUnlinkUsages = async (selectedUsages: MachineAuthTemplateUsage[]) => {
    try {
      await unlinkUsage({
        templateId,
        identityIds: selectedUsages.map((usage) => usage.identityId),
        organizationId
      });

      createNotification({
        text: TEMPLATE_ERROR_MESSAGES.UNLINK_SUCCESS,
        type: "success"
      });

      setSelectedUsageIds([]);
      handlePopUpClose("unlinkUsages");
      refetch();
    } catch {
      createNotification({
        text: TEMPLATE_ERROR_MESSAGES.UNLINK_FAILED,
        type: "error"
      });
    }
  };

  const handleUsageToggle = (usageId: string) => {
    setSelectedUsageIds((prev) =>
      prev.includes(usageId) ? prev.filter((id) => id !== usageId) : [...prev, usageId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUsageIds.length === usages.length) {
      setSelectedUsageIds([]);
    } else {
      setSelectedUsageIds(usages.map((usage) => usage.identityId));
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={onClose}>
        <ModalContent
          title={`Auth Template Usages: ${templateName}`}
          subTitle="Manage identities using this template"
          className="max-w-4xl"
        >
          <div>
            <div
              className={twMerge(
                "h-0 flex-shrink-0 overflow-hidden transition-all",
                selectedUsageIds.length > 0 && "h-16"
              )}
            >
              <div className="flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 px-4 py-2 text-bunker-300">
                <div className="mr-2 text-sm">{selectedUsageIds.length} Selected</div>
                <button
                  type="button"
                  className="mr-auto text-xs text-mineshaft-400 underline-offset-2 hover:text-mineshaft-200 hover:underline"
                  onClick={() => setSelectedUsageIds([])}
                >
                  {TEMPLATE_UI_LABELS.UNSELECT_ALL}
                </button>
                <Button
                  variant="outline_bg"
                  colorSchema="danger"
                  leftIcon={<FontAwesomeIcon icon={faTrash} />}
                  className="ml-2"
                  onClick={() => {
                    const selectedUsagesList = usages.filter((usage) =>
                      selectedUsageIds.includes(usage.identityId)
                    );

                    if (!selectedUsagesList.length) return;

                    handlePopUpOpen("unlinkUsages", { selectedUsagesList });
                  }}
                  size="xs"
                >
                  {TEMPLATE_UI_LABELS.UNLINK}
                </Button>
              </div>
            </div>

            <TableContainer>
              <Table>
                <THead>
                  <Tr className="h-14">
                    <Th className="w-12">
                      <Checkbox
                        id="select-all"
                        className="mr-2"
                        isChecked={usages.length > 0 && selectedUsageIds.length === usages.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </Th>
                    <Th>Identity Name</Th>
                    <Th>Identity ID</Th>
                  </Tr>
                </THead>
                <TBody>
                  {isPending && <TableSkeleton columns={4} innerKey="template-usages" />}
                  {!isPending &&
                    usages.map((usage) => (
                      <Tr
                        className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                        key={`usage-${usage.identityId}`}
                      >
                        <Td>
                          <Checkbox
                            id="select-usage"
                            isChecked={selectedUsageIds.includes(usage.identityId)}
                            onCheckedChange={() => handleUsageToggle(usage.identityId)}
                          />
                        </Td>
                        <Td>{usage.identityName}</Td>
                        <Td>
                          <span className="text-sm text-mineshaft-400">{usage.identityId}</span>
                        </Td>
                      </Tr>
                    ))}
                </TBody>
              </Table>
              {!isPending && usages.length === 0 && (
                <EmptyState
                  title="This template is not currently being used by any identities"
                  icon={faCertificate}
                />
              )}
            </TableContainer>
          </div>
        </ModalContent>
      </Modal>

      <DeleteActionModal
        isOpen={popUp.unlinkUsages.isOpen}
        title="Are you sure you want to unlink the following template usages?"
        onChange={(isDeleteOpen) => handlePopUpToggle("unlinkUsages", isDeleteOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          handleUnlinkUsages(
            popUp.unlinkUsages.data.selectedUsagesList as MachineAuthTemplateUsage[]
          )
        }
        buttonText={TEMPLATE_UI_LABELS.UNLINK}
      >
        <div className="mt-4 text-sm text-mineshaft-400">
          This template will no longer be used by the following{" "}
          {popUp.unlinkUsages.data?.selectedUsagesList?.length > 1 ? "identities" : "identity"}:
        </div>
        <div className="mt-2 max-h-[20rem] overflow-y-auto rounded border border-mineshaft-600 bg-red/10 p-4 pl-8 text-sm text-red-200">
          <ul className="list-disc">
            {(popUp.unlinkUsages.data?.selectedUsagesList as MachineAuthTemplateUsage[])?.map(
              (usage) => (
                <li key={usage.identityId}>
                  <div className="mb-1 flex items-center">
                    <span className="break-all">{usage.identityName}</span>
                    <Badge
                      variant="danger"
                      className="ml-2 inline-flex w-min items-center gap-1.5 whitespace-nowrap"
                    >
                      {usage.identityId}
                    </Badge>
                  </div>
                </li>
              )
            )}
          </ul>
        </div>
      </DeleteActionModal>
    </>
  );
};
