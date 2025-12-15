import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import {
  faCertificate,
  faCog,
  faEllipsis,
  faFileContract,
  faPencil,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Modal,
  ModalContent,
  PageHeader,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  Tag,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteCertTemplateV2 } from "@app/hooks/api";
import { useListCertificateTemplates } from "@app/hooks/api/certificateTemplates/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

import { CertificateModal } from "../CertificatesPage/components/CertificateModal";
import { CertificateTemplateEnrollmentModal } from "../CertificatesPage/components/CertificateTemplateEnrollmentModal";
import { PkiTemplateForm } from "./components/PkiTemplateForm";

const PER_PAGE_INIT = 25;
export const PkiTemplateListPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "certificateTemplate",
    "deleteTemplate",
    "enrollmentOptions",
    "estUpgradePlan",
    "certificateFromTemplate"
  ] as const);

  const { subscription } = useSubscription();

  const { data, isPending } = useListCertificateTemplates({
    projectId: currentProject.id,
    offset: (page - 1) * perPage,
    limit: perPage
  });

  const deleteCertTemplate = useDeleteCertTemplateV2();

  const onRemovePkiSubscriberSubmit = async () => {
    const pkiTemplate = await deleteCertTemplate.mutateAsync({
      projectId: currentProject.id,
      templateName: popUp?.deleteTemplate?.data?.name
    });

    createNotification({
      text: `Successfully deleted PKI template: ${pkiTemplate.name}`,
      type: "success"
    });

    handlePopUpClose("deleteTemplate");
  };

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PKI Templates" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col justify-between text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.CertificateManager}
              title="Certificate Templates"
              description="Manage certificate template to request and issue dynamic certificates following a strict format."
            />
          </div>
          <div className="container mx-auto mb-6 max-w-8xl rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            {/* TODO: Use subscription.get(SubscriptionProductCategory.CertificateManager, "pkiLegacyTemplates") to block legacy templates creation */}
            <div className="mb-4 flex justify-between">
              <p className="text-xl font-medium text-mineshaft-100">Templates</p>
              <div className="flex w-full justify-end">
                <ProjectPermissionCan
                  I={ProjectPermissionPkiTemplateActions.Create}
                  a={ProjectPermissionSub.CertificateTemplates}
                >
                  {(isAllowed) => (
                    <Button
                      colorSchema="primary"
                      type="submit"
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                      onClick={() => handlePopUpOpen("certificateTemplate")}
                      isDisabled={!isAllowed}
                      className="ml-4"
                    >
                      Add Template
                    </Button>
                  )}
                </ProjectPermissionCan>
              </div>
            </div>
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Issuing CA</Th>
                    <Th className="w-64">Last Updated At</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {isPending && <TableSkeleton columns={4} innerKey="project-cert-templates" />}
                  {!isPending &&
                    data?.certificateTemplates?.map((template) => {
                      return (
                        <Tr className="h-10" key={`certificate-template-${template.id}`}>
                          <Td>{template.name}</Td>
                          <Td>
                            <Tag size="xs">{template.ca.name}</Tag>
                          </Td>
                          <Td>{format(new Date(template.updatedAt), "yyyy-MM-dd | HH:mm:ss")}</Td>
                          <Td className="text-right align-middle">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild className="rounded-lg">
                                <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                                  <Tooltip content="More options">
                                    <FontAwesomeIcon size="lg" icon={faEllipsis} />
                                  </Tooltip>
                                </div>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="p-1">
                                <ProjectPermissionCan
                                  I={ProjectPermissionCertificateActions.Create}
                                  a={ProjectPermissionSub.Certificates}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      className={twMerge(
                                        !isAllowed &&
                                          "pointer-events-none cursor-not-allowed opacity-50"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePopUpOpen("certificateFromTemplate", template);
                                      }}
                                      disabled={!isAllowed}
                                      icon={<FontAwesomeIcon icon={faFileContract} />}
                                    >
                                      Issue Certificate
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                                <ProjectPermissionCan
                                  I={ProjectPermissionPkiTemplateActions.Edit}
                                  a={ProjectPermissionSub.CertificateTemplates}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      className={twMerge(
                                        !isAllowed &&
                                          "pointer-events-none cursor-not-allowed opacity-50"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePopUpOpen("certificateTemplate", template);
                                      }}
                                      disabled={!isAllowed}
                                      icon={<FontAwesomeIcon icon={faPencil} />}
                                    >
                                      Edit Template
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                                <ProjectPermissionCan
                                  I={ProjectPermissionPkiTemplateActions.Edit}
                                  a={ProjectPermissionSub.CertificateTemplates}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      className={twMerge(
                                        !isAllowed &&
                                          "pointer-events-none cursor-not-allowed opacity-50"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (
                                          !subscription.get(
                                            SubscriptionProductCategory.CertificateManager,
                                            "pkiEst"
                                          )
                                        ) {
                                          handlePopUpOpen("estUpgradePlan", {
                                            isEnterpriseFeature: true
                                          });
                                          return;
                                        }
                                        handlePopUpOpen("enrollmentOptions", {
                                          id: template.id
                                        });
                                      }}
                                      disabled={!isAllowed}
                                      icon={<FontAwesomeIcon icon={faCog} />}
                                    >
                                      Manage Enrollment
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                                <ProjectPermissionCan
                                  I={ProjectPermissionPkiTemplateActions.Delete}
                                  a={ProjectPermissionSub.CertificateTemplates}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      className={twMerge(
                                        !isAllowed &&
                                          "pointer-events-none cursor-not-allowed opacity-50"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePopUpOpen("deleteTemplate", template);
                                      }}
                                      disabled={!isAllowed}
                                      icon={<FontAwesomeIcon icon={faTrash} />}
                                    >
                                      Delete Template
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </Td>
                        </Tr>
                      );
                    })}
                  {!isPending && !data?.certificateTemplates?.length && (
                    <Tr>
                      <Td colSpan={4}>
                        <EmptyState title="No certificate templates found" icon={faCertificate} />
                      </Td>
                    </Tr>
                  )}
                </TBody>
              </Table>
              {!isPending && data?.totalCount !== undefined && data.totalCount >= PER_PAGE_INIT && (
                <Pagination
                  count={data.totalCount}
                  page={page}
                  perPage={perPage}
                  onChangePage={(newPage) => setPage(newPage)}
                  onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
                />
              )}
            </TableContainer>
            <DeleteActionModal
              isOpen={popUp.deleteTemplate.isOpen}
              title="Are you sure you want to remove the PKI Template?"
              onChange={(isOpen) => handlePopUpToggle("deleteTemplate", isOpen)}
              deleteKey="confirm"
              onDeleteApproved={() => onRemovePkiSubscriberSubmit()}
            />
          </div>
          <div className="container mx-auto max-w-8xl" />
        </div>
        <Modal
          isOpen={popUp?.certificateTemplate?.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("certificateTemplate", isOpen)}
        >
          <ModalContent
            title={
              popUp.certificateTemplate?.data
                ? "Certificate Template"
                : "Create Certificate Template"
            }
          >
            <PkiTemplateForm
              certTemplate={popUp?.certificateTemplate?.data}
              handlePopUpToggle={(isOpen) => handlePopUpToggle("certificateTemplate", isOpen)}
            />
          </ModalContent>
        </Modal>
        <CertificateTemplateEnrollmentModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        <CertificateModal
          popUp={{
            certificate: {
              isOpen: popUp.certificateFromTemplate.isOpen,
              data: popUp.certificateFromTemplate.data
            }
          }}
          handlePopUpToggle={(_, state) => handlePopUpToggle("certificateFromTemplate", state)}
          preselectedTemplate={popUp.certificateFromTemplate.data}
        />
      </div>
      <UpgradePlanModal
        isOpen={popUp.estUpgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("estUpgradePlan", isOpen)}
        text="Your current plan does not include access to configuring template enrollment methods. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.estUpgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
