import Link from "next/link";
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
import { formatDistance } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DeleteActionModal,
  EmptyState,
  IconButton,
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
  Tr,
  UpgradePlanModal
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription,
  useWorkspace
} from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  useDeleteSecretRotation,
  useGetSecretRotationProviders,
  useGetSecretRotations,
  useRestartSecretRotation
} from "@app/hooks/api";
import { TSecretRotationProviderTemplate } from "@app/hooks/api/types";

import { CreateRotationForm } from "./components/CreateRotationForm";

export const SecretRotationPage = withProjectPermission(
  () => {
    const { currentWorkspace } = useWorkspace();
    const { permission } = useProjectPermission();

    const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
      "createRotation",
      "activeBot",
      "deleteRotation",
      "upgradePlan"
    ] as const);
    const workspaceId = currentWorkspace?.id || "";
    const canCreateRotation = permission.can(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretRotation
    );
    const { subscription } = useSubscription();

    const { data: secretRotationProviders, isLoading: isRotationProviderLoading } =
      useGetSecretRotationProviders({ workspaceId });
    const { data: secretRotations, isLoading: isRotationLoading } = useGetSecretRotations({
      workspaceId
    });

    const {
      mutateAsync: deleteSecretRotation,
      variables: deleteSecretRotationVars,
      isLoading: isDeletingRotation
    } = useDeleteSecretRotation();
    const {
      mutateAsync: restartSecretRotation,
      variables: restartSecretRotationVar,
      isLoading: isRestartingRotation
    } = useRestartSecretRotation();

    const handleDeleteRotation = async () => {
      const { id } = popUp.deleteRotation.data as { id: string };
      try {
        await deleteSecretRotation({
          id,
          workspaceId
        });
        handlePopUpClose("deleteRotation");
        createNotification({
          type: "success",
          text: "Successfully removed rotation"
        });
      } catch (error) {
        console.log(error);
        createNotification({
          type: "error",
          text: "Failed to remove rotation"
        });
      }
    };

    const handleRestartRotation = async (id: string) => {
      try {
        await restartSecretRotation({
          id,
          workspaceId
        });
        createNotification({
          type: "success",
          text: "Secret rotation  initiated"
        });
      } catch (error) {
        console.log(error);
        createNotification({
          type: "error",
          text: "Failed to restart rotation"
        });
      }
    };

    const handleCreateRotation = async (provider: TSecretRotationProviderTemplate) => {
      if (subscription && !subscription?.secretRotation) {
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
      <div className="container mx-auto h-full w-full max-w-7xl bg-bunker-800 px-6 text-white">
        <div className="flex items-center justify-between py-6">
          <div className="flex w-full flex-col">
            <h2 className="text-3xl font-semibold text-gray-200">Secret Rotation</h2>
            <p className="text-bunker-300">
              Stop manually rotating secrets and automate credential rotation.
            </p>
          </div>
          <div className="flex w-max justify-center">
            <Link href="https://infisical.com/docs/documentation/platform/secret-rotation/overview">
              <span className="w-max cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
                Documentation{" "}
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.06rem] ml-1 text-xs"
                />
              </span>
            </Link>
          </div>
        </div>
        <div className="mb-6">
          <div className="mb-2 mt-6 text-xl font-semibold text-gray-200">Rotated Secrets</div>
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
                            <div className="flex w-min items-center rounded border border-bunker-400 p-1 px-2">
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
                                I={ProjectPermissionActions.Edit}
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
                                I={ProjectPermissionActions.Delete}
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
        <div className="mb-2 mt-12 text-xl font-semibold text-gray-200">
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
                  if (evt.key === "Enter") handlePopUpOpen("createRotation", provider);
                }}
                onClick={() => handleCreateRotation(provider)}
              >
                <img
                  src={`/images/secretRotation/${provider.image}`}
                  className="max-h-16"
                  style={{ maxWidth: "6rem" }}
                  alt="rotation provider logo"
                />
                <div className="ml-4 max-w-xs text-xl font-semibold text-gray-300 duration-200 group-hover:text-gray-200">
                  {provider.title}
                </div>
                <div className="absolute top-1 right-1.5 opacity-0 transition-all group-hover:opacity-100">
                  <Tooltip content={provider.description} sideOffset={10}>
                    <FontAwesomeIcon icon={faInfoCircle} className="text-primary" />
                  </Tooltip>
                </div>
              </div>
            ))}
          <Link href="https://github.com/Infisical/infisical/issues">
            <div className="group relative flex h-32 cursor-pointer flex-row items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4 hover:border-primary/40 hover:bg-primary/10">
              <FontAwesomeIcon icon={faPlus} className="pl-3 pr-2 text-3xl text-gray-300" />
              <div className="ml-4 max-w-xs text-xl font-semibold text-gray-300 duration-200 group-hover:text-gray-200">
                Request or create your own template
              </div>
            </div>
          </Link>
        </div>
        <CreateRotationForm
          isOpen={popUp.createRotation.isOpen}
          workspaceId={workspaceId}
          onToggle={(isOpen) => handlePopUpToggle("createRotation", isOpen)}
          provider={(popUp.createRotation.data as TSecretRotationProviderTemplate) || {}}
        />
        <DeleteActionModal
          isOpen={popUp.deleteRotation.isOpen}
          title="Are you sure want to delete this rotation?"
          subTitle="This will stop the rotation from dynamically changing. Secret won't be deleted"
          onChange={(isOpen) => handlePopUpToggle("deleteRotation", isOpen)}
          deleteKey="delete"
          onDeleteApproved={handleDeleteRotation}
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="You can add secret rotation if you switch to Infisical's Team plan."
        />
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretRotation }
);
