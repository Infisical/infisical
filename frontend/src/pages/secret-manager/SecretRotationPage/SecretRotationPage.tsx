import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import {
  faArrowsSpin,
  faArrowUpRightFromSquare,
  faExclamationTriangle,
  faFolder,
  faInfoCircle,
  faPlus,
  faRotate,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate } from "@tanstack/react-router";
import { formatDistance } from "date-fns";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  IconButton,
  Modal,
  ModalContent,
  PageHeader,
  Skeleton,
  Spinner,
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
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import {
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionSecretRotationActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  useDeleteSecretRotation,
  useGetSecretRotationProviders,
  useGetSecretRotations,
  useRestartSecretRotation
} from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { TSecretRotationProviderTemplate } from "@app/hooks/api/secretRotation/types";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { CreateRotationForm } from "@app/pages/secret-manager/SecretRotationPage/components/CreateRotationForm";

const Page = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();

  const navigate = useNavigate();

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "createRotation",
    "activeBot",
    "deleteRotation",
    "upgradePlan",
    "secretRotationV2"
  ] as const);
  const workspaceId = currentProject?.id || "";
  const canCreateRotation = permission.can(
    ProjectPermissionSecretRotationActions.Create,
    ProjectPermissionSub.SecretRotation
  );
  const { subscription } = useSubscription();

  const { data: secretRotationProviders, isPending: isRotationProviderLoading } =
    useGetSecretRotationProviders({ workspaceId });
  const { data: secretRotations, isPending: isRotationLoading } = useGetSecretRotations({
    workspaceId
  });

  const {
    mutateAsync: deleteSecretRotation,
    variables: deleteSecretRotationVars,
    isPending: isDeletingRotation
  } = useDeleteSecretRotation();
  const {
    mutateAsync: restartSecretRotation,
    variables: restartSecretRotationVar,
    isPending: isRestartingRotation
  } = useRestartSecretRotation();

  const handleDeleteRotation = async () => {
    const { id } = popUp.deleteRotation.data as { id: string };
    await deleteSecretRotation({
      id,
      workspaceId
    });
    handlePopUpClose("deleteRotation");
    createNotification({
      type: "success",
      text: "Successfully removed rotation"
    });
  };

  const handleRestartRotation = async (id: string) => {
    await restartSecretRotation({
      id,
      workspaceId
    });
    createNotification({
      type: "success",
      text: "Secret rotation  initiated"
    });
  };

  const handleCreateRotation = (provider: TSecretRotationProviderTemplate) => {
    if (
      subscription &&
      !subscription?.get(SubscriptionProductCategory.SecretManager, "secretRotation")
    ) {
      handlePopUpOpen("upgradePlan");
      return;
    }
    if (!canCreateRotation) {
      createNotification({ type: "error", text: "Access permission denied!!" });
      return;
    }
    handlePopUpOpen("createRotation", provider);
  };

  return (
    <div className="container mx-auto w-full max-w-8xl bg-bunker-800 text-white">
      <PageHeader
        scope={ProjectType.SecretManager}
        title="Secret Rotation"
        description="Stop manually rotating secrets and automate credential rotation."
      >
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://infisical.com/docs/documentation/platform/secret-rotation/overview"
        >
          <span className="flex w-max cursor-pointer items-center rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
            Documentation
            <FontAwesomeIcon
              icon={faArrowUpRightFromSquare}
              className="mb-[0.06rem] ml-1 text-xs"
            />
          </span>
        </a>
      </PageHeader>
      <NoticeBannerV2 title="Secret Rotations Update">
        <p className="text-sm text-bunker-200">
          Infisical is revamping its Secret Rotation experience.
        </p>
        <p className="mt-2 text-sm text-bunker-200">
          PostgreSQL and Microsoft SQL Server Rotations can now be created from the{" "}
          <Link
            className="text-mineshaft-100 underline decoration-primary underline-offset-2 hover:text-mineshaft-200"
            to="/organizations/$orgId/projects/secret-management/$projectId/overview"
            params={{ orgId: currentOrg.id, projectId: currentProject.id }}
          >
            Secret Manager Dashboard
          </Link>{" "}
          from the actions dropdown.
        </p>
      </NoticeBannerV2>
      <div className="mb-6">
        <div className="mt-6 mb-2 text-xl font-medium text-gray-200">Rotated Secrets</div>
        <div className="flex flex-col space-y-2">
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Th>Secret Name</Th>
                  <Th>Environment</Th>
                  <Th>Provider</Th>
                  <Th>Status</Th>
                  <Th>Last Rotation</Th>
                  <Th className="text-right">Action</Th>
                </Tr>
              </THead>
              <TBody>
                {isRotationLoading && (
                  <TableSkeleton
                    innerKey="secret-rotation-loading"
                    columns={6}
                    className="bg-mineshaft-700"
                  />
                )}
                {!isRotationLoading && secretRotations?.length === 0 && (
                  <Tr>
                    <Td colSpan={6}>
                      <EmptyState title="No rotation strategy found" icon={faArrowsSpin} />
                    </Td>
                  </Tr>
                )}
                {secretRotations?.map(
                  ({
                    environment,
                    secretPath,
                    outputs,
                    provider,
                    id,
                    lastRotatedAt,
                    status,
                    statusMessage
                  }) => {
                    const isDeleting = deleteSecretRotationVars?.id === id && isDeletingRotation;
                    const isRestarting =
                      restartSecretRotationVar?.id === id && isRestartingRotation;
                    return (
                      <Tr key={id}>
                        <Td>
                          {outputs
                            .map(({ key }) => key)
                            .join(",")
                            .toUpperCase()}
                        </Td>
                        <Td>
                          <div className="flex w-min items-center rounded-sm border border-bunker-400 p-1 px-2">
                            <div>{environment.slug}</div>
                            <div className="ml-1 flex items-center border-l border-bunker-400 pl-1 text-xs">
                              <FontAwesomeIcon icon={faFolder} className="mr-1" />
                              {secretPath}
                            </div>
                          </div>
                        </Td>
                        <Td>{provider}</Td>
                        <Td>
                          <div className="flex items-center">
                            {status}
                            {status === "failed" && (
                              <Tooltip content={statusMessage}>
                                <FontAwesomeIcon
                                  icon={faExclamationTriangle}
                                  size="sm"
                                  className="ml-2 text-red"
                                />
                              </Tooltip>
                            )}
                          </div>
                        </Td>
                        <Td>
                          {lastRotatedAt
                            ? formatDistance(new Date(lastRotatedAt), new Date())
                            : "-"}
                        </Td>
                        <Td>
                          <div className="flex justify-end space-x-2">
                            <ProjectPermissionCan
                              I={ProjectPermissionSecretRotationActions.Edit}
                              a={ProjectPermissionSub.SecretRotation}
                              allowedLabel="Rotate now"
                              renderTooltip
                            >
                              {(isAllowed) => (
                                <IconButton
                                  variant="plain"
                                  colorSchema="danger"
                                  ariaLabel="delete-rotation"
                                  isDisabled={isDeleting || !isAllowed}
                                  onClick={() => handleRestartRotation(id)}
                                >
                                  {isRestarting ? (
                                    <Spinner size="xs" />
                                  ) : (
                                    <FontAwesomeIcon icon={faRotate} />
                                  )}
                                </IconButton>
                              )}
                            </ProjectPermissionCan>
                            <ProjectPermissionCan
                              I={ProjectPermissionSecretRotationActions.Delete}
                              a={ProjectPermissionSub.SecretRotation}
                              allowedLabel="Rotate now"
                              renderTooltip
                            >
                              {(isAllowed) => (
                                <IconButton
                                  variant="plain"
                                  colorSchema="danger"
                                  ariaLabel="delete-rotation"
                                  isDisabled={isDeleting || !isAllowed}
                                  onClick={() => handlePopUpOpen("deleteRotation", { id })}
                                >
                                  {isDeleting ? (
                                    <Spinner size="xs" />
                                  ) : (
                                    <FontAwesomeIcon icon={faTrash} />
                                  )}
                                </IconButton>
                              )}
                            </ProjectPermissionCan>
                          </div>
                        </Td>
                      </Tr>
                    );
                  }
                )}
              </TBody>
            </Table>
          </TableContainer>
        </div>
      </div>
      <div className="mt-12 mb-2 text-xl font-medium text-gray-200">
        Infisical Rotation Providers
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        {isRotationProviderLoading &&
          Array.from({ length: 12 }).map((_, index) => (
            <Skeleton className="h-32" key={`rotation-provider-skeleton-${index + 1}`} />
          ))}
        {!isRotationProviderLoading &&
          secretRotationProviders?.providers.map((provider) => (
            <div
              className="group relative flex h-32 cursor-pointer flex-row items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4 hover:border-primary/40 hover:bg-primary/10"
              key={`infisical-rotation-provider-${provider.name}`}
              tabIndex={0}
              role="button"
              onKeyDown={(evt) => {
                if (evt.key !== "Enter") return;
                if (provider.isDeprecated) {
                  handlePopUpOpen("secretRotationV2", provider.title);
                } else {
                  handleCreateRotation(provider);
                }
              }}
              onClick={() => {
                if (provider.isDeprecated) {
                  handlePopUpOpen("secretRotationV2", provider.title);
                } else {
                  handleCreateRotation(provider);
                }
              }}
            >
              <img
                src={`/images/secretRotation/${provider.image}`}
                className="max-h-16"
                style={{ maxWidth: "6rem" }}
                alt="rotation provider logo"
              />
              <div className="ml-4 max-w-xs text-xl font-medium text-gray-300 duration-200 group-hover:text-gray-200">
                {provider.title}
              </div>
              <div className="absolute top-1 right-1.5 opacity-0 transition-all group-hover:opacity-100">
                <Tooltip content={provider.description} sideOffset={10}>
                  <FontAwesomeIcon icon={faInfoCircle} className="text-primary" />
                </Tooltip>
              </div>
            </div>
          ))}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://github.com/Infisical/infisical/issues"
        >
          <div className="group relative flex h-32 cursor-pointer flex-row items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4 hover:border-primary/40 hover:bg-primary/10">
            <FontAwesomeIcon icon={faPlus} className="pr-2 pl-3 text-3xl text-gray-300" />
            <div className="ml-4 max-w-xs text-xl font-medium text-gray-300 duration-200 group-hover:text-gray-200">
              Request or create your own template
            </div>
          </div>
        </a>
      </div>
      <CreateRotationForm
        isOpen={popUp.createRotation.isOpen}
        workspaceId={workspaceId}
        onToggle={(isOpen) => handlePopUpToggle("createRotation", isOpen)}
        provider={(popUp.createRotation.data as TSecretRotationProviderTemplate) || {}}
      />
      <DeleteActionModal
        isOpen={popUp.deleteRotation.isOpen}
        title="Are you sure you want to delete this rotation?"
        subTitle="This will stop the rotation from dynamically changing. Secret won't be deleted"
        onChange={(isOpen) => handlePopUpToggle("deleteRotation", isOpen)}
        deleteKey="delete"
        onDeleteApproved={handleDeleteRotation}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Adding secret rotations can be unlocked if you upgrade to Infisical Pro plan."
      />
      <Modal
        isOpen={popUp.secretRotationV2.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("secretRotationV2", isOpen)}
      >
        <ModalContent className="max-w-5xl" title="Secret Rotation Update">
          <div className="flex flex-col gap-2">
            <p className="text-mineshaft-200">
              Infisical is revamping its Secret Rotation experience. Navigate to the{" "}
              <Link
                className="text-mineshaft-100 underline decoration-primary underline-offset-2 hover:text-mineshaft-200"
                to="/organizations/$orgId/projects/secret-management/$projectId/overview"
                params={{ orgId: currentOrg.id, projectId: currentProject.id }}
              >
                Secret Manager Dashboard
              </Link>{" "}
              to create a {popUp.secretRotationV2.data} Rotation.
            </p>
            <div className="overflow-clip rounded-sm border border-mineshaft-600">
              <img
                src="/images/secretRotation/secret-rotations-v2-location.png"
                alt="Secret Rotation V2 location"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                onClick={() =>
                  navigate({
                    to: "/organizations/$orgId/projects/secret-management/$projectId/overview",
                    params: { orgId: currentOrg.id, projectId: currentProject.id }
                  })
                }
                colorSchema="secondary"
              >
                Navigate to Secret Manager
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
};
export const SecretRotationPage = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <ProjectPermissionCan
        I={ProjectPermissionSecretRotationActions.Read}
        a={ProjectPermissionSub.SecretRotation}
        passThrough={false}
        renderGuardBanner
      >
        <Page />
      </ProjectPermissionCan>
    </div>
  );
};
