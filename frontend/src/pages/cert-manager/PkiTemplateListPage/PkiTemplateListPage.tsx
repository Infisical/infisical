import { useState } from "react";
import {
  faCog,
  faEllipsis,
  faFileContract,
  faPencil,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import {
  CertificateEnrollmentUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog,
  DiscardChangesAlertDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  PageHeader,
  Pagination,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows
} from "@app/components/v3";
import { LegacyPkiResource } from "@app/const/legacyPkiDeprecation";
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
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { CertificateModal } from "../CertificatesPage/components/CertificateModal";
import { CertificateTemplateEnrollmentModal } from "../CertificatesPage/components/CertificateTemplateEnrollmentModal";
import { LegacyPkiCreationBlockedModal } from "../components/LegacyPkiCreationBlockedModal";
import { LegacyPkiDeprecationAlert } from "../components/LegacyPkiDeprecationAlert";
import { PkiTemplateForm } from "./components/PkiTemplateForm";

const PER_PAGE_INIT = 25;
export const PkiTemplateListPage = () => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "certificateTemplate",
    "deleteTemplate",
    "enrollmentOptions",
    "estUpgradePlan",
    "certificateFromTemplate",
    "creationBlocked"
  ] as const);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const { subscription } = useSubscription();
  const { currentProject } = useProject();

  const { data, isPending } = useListCertificateTemplates({
    projectId: currentProject.id,
    offset: (page - 1) * perPage,
    limit: perPage
  });

  const deleteCertTemplate = useDeleteCertTemplateV2();

  const onRemovePkiSubscriberSubmit = async () => {
    const pkiTemplate = await deleteCertTemplate.mutateAsync({
      templateName: popUp?.deleteTemplate?.data?.name,
      projectId: currentProject.id
    });

    createNotification({
      text: `Successfully deleted PKI template: ${pkiTemplate.name}`,
      type: "success"
    });

    handlePopUpClose("deleteTemplate");
  };

  const [editorState, setEditorState] = useState({ isDirty: false, isPending: false });
  const { requestDiscard, confirmDiscard, isDiscardDialogOpen, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty: editorState.isDirty,
      onDiscard: () => handlePopUpToggle("certificateTemplate", false)
    });

  return (
    <>
      <PageTitle title="PKI Templates" />
      <div className="h-full bg-page">
        <div className="mx-auto flex flex-col justify-between">
          <div className="mx-auto flex w-full max-w-8xl flex-col">
            <PageHeader
              scope={ProjectType.CertificateManager}
              title="Certificate Templates"
              description="Manage certificate template to request and issue dynamic certificates following a strict format."
            />
            <div className="flex flex-col gap-8">
              <LegacyPkiDeprecationAlert resource={LegacyPkiResource.CertificateTemplate} />
              <Card>
                <CardHeader>
                  <CardTitle>Templates</CardTitle>
                  <CardAction>
                    <div className="flex w-full justify-end">
                      <ProjectPermissionCan
                        I={ProjectPermissionPkiTemplateActions.Create}
                        a={ProjectPermissionSub.CertificateTemplates}
                      >
                        {(isAllowed) => (
                          <Button
                            type="submit"
                            onClick={() => handlePopUpOpen("creationBlocked")}
                            isDisabled={!isAllowed}
                            variant="project"
                          >
                            <FontAwesomeIcon icon={faPlus} />
                            Add Template
                          </Button>
                        )}
                      </ProjectPermissionCan>
                    </div>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {isPending || data?.certificateTemplates?.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Issuing CA</TableHead>
                          <TableHead className="w-64">Last Updated At</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isPending && <TableSkeletonRows columns={4} />}
                        {!isPending &&
                          data?.certificateTemplates?.map((template) => {
                            return (
                              <TableRow key={`certificate-template-${template.id}`}>
                                <TableCell>{template.name}</TableCell>
                                <TableCell>
                                  <Badge variant="neutral">{template.ca.name}</Badge>
                                </TableCell>
                                <TableCell>
                                  {format(new Date(template.updatedAt), "yyyy-MM-dd | HH:mm:ss")}
                                </TableCell>
                                <TableCell className="text-right align-middle">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <IconButton
                                        variant="ghost"
                                        size="xs"
                                        aria-label="More options"
                                      >
                                        <FontAwesomeIcon icon={faEllipsis} />
                                      </IconButton>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                      <ProjectPermissionCan
                                        I={ProjectPermissionCertificateActions.Create}
                                        a={ProjectPermissionSub.Certificates}
                                      >
                                        {(isAllowed) => (
                                          <DropdownMenuItem
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handlePopUpOpen("certificateFromTemplate", template);
                                            }}
                                            isDisabled={!isAllowed}
                                          >
                                            <FontAwesomeIcon icon={faFileContract} />
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
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handlePopUpOpen("certificateTemplate", template);
                                            }}
                                            isDisabled={!isAllowed}
                                          >
                                            <FontAwesomeIcon icon={faPencil} />
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
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (!subscription.pkiEst) {
                                                openUpgradeGate({
                                                  intent: CertificateEnrollmentUpgradeIntent,
                                                  paywallKey: "cert-manager.pki-template-list"
                                                });
                                                return;
                                              }
                                              handlePopUpOpen("enrollmentOptions", {
                                                id: template.id
                                              });
                                            }}
                                            isDisabled={!isAllowed}
                                          >
                                            <FontAwesomeIcon icon={faCog} />
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
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handlePopUpOpen("deleteTemplate", template);
                                            }}
                                            isDisabled={!isAllowed}
                                            variant="danger"
                                          >
                                            <FontAwesomeIcon icon={faTrash} />
                                            Delete Template
                                          </DropdownMenuItem>
                                        )}
                                      </ProjectPermissionCan>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  ) : (
                    <Empty className="border">
                      <EmptyHeader>
                        <EmptyTitle>No certificate templates found</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
                {!isPending &&
                  data?.totalCount !== undefined &&
                  data.totalCount >= PER_PAGE_INIT && (
                    <CardFooter>
                      <Pagination
                        count={data.totalCount}
                        page={page}
                        perPage={perPage}
                        onChangePage={(newPage) => setPage(newPage)}
                        onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
                      />
                    </CardFooter>
                  )}
                <ConfirmationAlertDialog
                  isOpen={popUp.deleteTemplate.isOpen}
                  description="This action is irreversible."
                  title="Are you sure you want to remove the PKI Template?"
                  onOpenChange={(isOpen) => handlePopUpToggle("deleteTemplate", isOpen)}
                  confirmKey="confirm"
                  onConfirm={() => onRemovePkiSubscriberSubmit()}
                />
              </Card>
            </div>
          </div>
          <div className="container mx-auto max-w-8xl" />
        </div>
        <Sheet
          open={popUp?.certificateTemplate?.isOpen}
          onOpenChange={(isOpen) => {
            if (!isOpen) requestDiscard();
          }}
        >
          <SheetContent size="form" isPending={editorState.isPending}>
            <SheetHeader>
              <SheetTitle>
                {popUp.certificateTemplate?.data
                  ? "Certificate Template"
                  : "Create Certificate Template"}
              </SheetTitle>
              <SheetDescription>Configure the certificate template.</SheetDescription>
            </SheetHeader>
            <PkiTemplateForm
              onStateChange={setEditorState}
              onCancel={requestDiscard}
              certTemplate={popUp?.certificateTemplate?.data}
              handlePopUpToggle={(isOpen) => handlePopUpToggle("certificateTemplate", isOpen)}
            />
          </SheetContent>
        </Sheet>
        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Changes?"
          description="Your unsaved template changes will be lost."
        />
        <CertificateTemplateEnrollmentModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        <LegacyPkiCreationBlockedModal
          resource={LegacyPkiResource.CertificateTemplate}
          isOpen={popUp.creationBlocked.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("creationBlocked", isOpen)}
        />
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
      {upgradeGate}
    </>
  );
};
