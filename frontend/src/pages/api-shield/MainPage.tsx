import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  IconButton,
  Modal,
  ModalContent,
  PageHeader,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { bridgeQueryKeys, useDeleteBridge } from "@app/hooks/api/bridge";
import { faPencil, faPlus, faRuler, faShield } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { ShieldForm } from "./ShieldForm";
import { RuleSetManagementForm } from "./RuleSetManagementForm";

export const MainPage = () => {
  const { currentWorkspace } = useWorkspace();
  const { data: bridges, isPending: isBridgeLoading } = useQuery(
    bridgeQueryKeys.list(currentWorkspace.id)
  );
  const { mutateAsync: removeShield } = useDeleteBridge();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addShield",
    "removeShield",
    "updateRuleSet"
  ] as const);

  const handleRemoveShield = async () => {
    const id = (popUp?.removeShield?.data as { id: string })?.id;
    if (!currentWorkspace?.id) return;

    try {
      await removeShield({
        id
      });
      createNotification({
        text: "Successfully removed shield from project",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to remove shield from the project",
        type: "error"
      });
    }
    handlePopUpClose("removeShield");
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <div className="mx-auto mb-6 w-full max-w-7xl">
        <PageHeader
          title="API Shield"
          description="Manage your APIs and agentic interation to them in one place"
        />
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xl font-semibold text-mineshaft-100">API Shields</p>
            <Button
              colorSchema="secondary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("addShield")}
            >
              Add Shield
            </Button>
          </div>
          <TableContainer className="mt-4">
            <Table>
              <THead>
                <Tr>
                  <Th className="w-1/3">
                    <div className="flex items-center">Name</div>
                  </Th>
                  <Th>
                    <div className="flex items-center">Updated At</div>
                  </Th>
                  <Th className="w-5" />
                </Tr>
              </THead>
              <TBody>
                {isBridgeLoading && <TableSkeleton columns={3} innerKey="bridges" />}
                {!isBridgeLoading && !bridges?.length && (
                  <Tr>
                    <Td colSpan={3}>
                      <EmptyState title="No shield found" icon={faShield} />
                    </Td>
                  </Tr>
                )}
                {!isBridgeLoading &&
                  bridges?.map((bridge) => {
                    return (
                      <Tr
                        key={`membership-${bridge.id}`}
                        className="group w-full cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                        role="button"
                        tabIndex={0}
                      >
                        <Td>{bridge.slug}</Td>
                        <Td>{format(new Date(bridge.updatedAt), "yyyy-MM-dd | HH:mm:ss")}</Td>
                        <Td>
                          <div className="flex gap-2">
                            <Tooltip content="Edit Shield">
                              <IconButton
                                className="mr-2 py-2"
                                onClick={() => {
                                  handlePopUpOpen("addShield", {
                                    id: bridge.id
                                  });
                                }}
                                colorSchema="primary"
                                variant="plain"
                                ariaLabel="update"
                              >
                                <FontAwesomeIcon icon={faPencil} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip content="Update rules">
                              <IconButton
                                className="py-2"
                                onClick={() => {
                                  handlePopUpOpen("updateRuleSet", {
                                    id: bridge.id
                                  });
                                }}
                                colorSchema="primary"
                                variant="plain"
                                ariaLabel="update"
                              >
                                <FontAwesomeIcon icon={faRuler} />
                              </IconButton>
                            </Tooltip>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
              </TBody>
            </Table>
          </TableContainer>
          <Modal
            isOpen={popUp.addShield.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("addShield", isOpen)}
          >
            <ModalContent
              title="Create API Shield"
              subTitle="Configure API protection for your application endpoints"
            >
              <ShieldForm
                id={popUp.addShield.data?.id}
                onSuccess={() => handlePopUpToggle("addShield")}
              />
            </ModalContent>
          </Modal>
          <Modal
            isOpen={popUp.updateRuleSet.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("updateRuleSet", isOpen)}
          >
            <ModalContent
              title="Update Rule"
              subTitle="Configure filtering rules for API endpoints. Rules within a set use AND logic, while sets use OR logic."
              className="min-h-96 max-w-4xl"
            >
              <RuleSetManagementForm
                bridgeId={popUp.updateRuleSet.data?.id}
                onSuccess={() => handlePopUpToggle("updateRuleSet")}
              />
            </ModalContent>
          </Modal>
          <DeleteActionModal
            isOpen={popUp.removeShield.isOpen}
            deleteKey="remove"
            title="Do you want to remove this shield from the project?"
            onChange={(isOpen) => handlePopUpToggle("removeShield", isOpen)}
            onDeleteApproved={handleRemoveShield}
          />
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/api-shield/$projectId/_api-shield-layout/overview"
)({
  component: MainPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Overview"
        }
      ]
    };
  }
});
