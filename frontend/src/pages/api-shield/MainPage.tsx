import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  IconButton,
  Input,
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
import {
  faMagnifyingGlass,
  faPencil,
  faPlus,
  faRuler,
  faShield
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { ShieldForm } from "./ShieldForm";
import { RuleSetManagementForm } from "./RuleSetManagementForm";
import { useState } from "react";
import { HighlightText } from "@app/components/v2/HighlightText";

export const MainPage = () => {
  const [searchFilter, setSearchFilter] = useState("");
  const { currentWorkspace } = useWorkspace();
  const { data: bridges, isPending: isBridgeLoading } = useQuery(
    bridgeQueryKeys.list(currentWorkspace.id)
  );
  const navigate = useNavigate();
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
        <div className="mb-4 flex">
          <PageHeader
            title="External APIs"
            description="Manage your external APIs and agentic integrations all in one place"
          />
        </div>

        <div className="flex w-full flex-row gap-2">
          <Input
            className="h-[2.3rem] bg-mineshaft-800 text-sm placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
            containerClassName="w-full"
            placeholder="Search by external API name..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          />
          <Button
            colorSchema="secondary"
            type="submit"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => handlePopUpOpen("addShield")}
          >
            Add External API
          </Button>
        </div>

        <div className="">
          <TableContainer className="mt-4">
            <Table>
              <THead>
                <Tr>
                  <Th className="w-1/3">
                    <div className="flex items-center">Name</div>
                  </Th>
                  <Th>
                    <div className="flex items-center">Base URL</div>
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
                      <EmptyState title="No bridges found" icon={faShield} />
                    </Td>
                  </Tr>
                )}
                {!isBridgeLoading &&
                  (bridges || [])
                    .filter((b) => b.slug.toLowerCase().includes(searchFilter.toLowerCase()))
                    .map((bridge) => {
                      return (
                        <Tr
                          key={`membership-${bridge.id}`}
                          className="group w-full cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            navigate({
                              to: "/projects/api-shield/$projectId/bridge/$bridgeId",
                              params: {
                                bridgeId: bridge.id,
                                projectId: bridge.projectId
                              }
                            });
                          }}
                        >
                          <Td>
                            <HighlightText text={bridge.slug} highlight={searchFilter} />
                          </Td>
                          <Td>{bridge.baseUrl}</Td>
                          <Td>{format(new Date(bridge.updatedAt), "yyyy-MM-dd | HH:mm:ss")}</Td>
                          <Td>
                            <div className="flex gap-2">
                              <Tooltip content="Edit External API">
                                <IconButton
                                  className="mr-2 py-2"
                                  onClick={(evt) => {
                                    evt.stopPropagation();
                                    evt.preventDefault();
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
                                  onClick={(evt) => {
                                    evt.stopPropagation();
                                    evt.preventDefault();
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
              title="Create External API"
              subTitle="Configure protection for your external API endpoints"
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
              title="Incoming Request Rules"
              subTitle="Configure filter rules for incoming requests to your External API"
              className="max-w-4xl pb-0"
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
            title="Do you want to remove this external API from the project?"
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
