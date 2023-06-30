import { useEffect, useRef, useState } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";
import {
  faArrowLeft,
  faCheck,
  faClockRotateLeft,
  faCodeCommit,
  faDownload,
  faEye,
  faEyeSlash,
  faFolderPlus,
  faMagnifyingGlass,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import { useQueryClient } from "@tanstack/react-query";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import NavHeader from "@app/components/navigation/NavHeader";
import {
  Button,
  DeleteActionModal,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TableContainer,
  Tag,
  Tooltip,
  UpgradePlanModal
} from "@app/components/v2";
import { leaveConfirmDefaultMessage } from "@app/const";
import { useSubscription,useWorkspace } from "@app/context";
import { useLeaveConfirm, usePopUp, useToggle } from "@app/hooks";
import {
  useBatchSecretsOp,
  useCreateFolder,
  useCreateWsTag,
  useDeleteFolder,
  useGetProjectFolders,
  useGetProjectSecrets,
  useGetSecretVersion,
  useGetSnapshotSecrets,
  useGetUserAction,
  useGetUserWsEnvironments,
  useGetUserWsKey,
  useGetWorkspaceSecretSnapshots,
  useGetWsSnapshotCount,
  useGetWsTags,
  usePerformSecretRollback,
  useRegisterUserAction,
  useUpdateFolder
} from "@app/hooks/api";
import { secretKeys } from "@app/hooks/api/secrets/queries";
import { WorkspaceEnv } from "@app/hooks/api/types";

import { CompareSecret } from "./components/CompareSecret";
import { CreateTagModal } from "./components/CreateTagModal";
import {
  FolderForm,
  FolderSection,
  TDeleteFolderForm,
  TEditFolderForm
} from "./components/FolderSection";
import { PitDrawer } from "./components/PitDrawer";
import { SecretDetailDrawer } from "./components/SecretDetailDrawer";
import { SecretDropzone } from "./components/SecretDropzone";
import { SecretInputRow } from "./components/SecretInputRow";
import { SecretTableHeader } from "./components/SecretTableHeader";
import {
  DEFAULT_SECRET_VALUE,
  downloadSecret,
  FormData,
  schema,
  transformSecretsToBatchSecretReq,
  TSecOverwriteOpt,
  TSecretDetailsOpen
} from "./DashboardPage.utils";

const USER_ACTION_PUSH = "first_time_secrets_pushed";

/*
 * Some imp aspects to consider. Here there are multiple stats changing
 * Thus ideally we need to use a context. But instead we rely on react hook form
 * React hook form provides context and high performance proxy based rendering
 * It also handles error handling and transferring states between inputs
 *
 * Another thing is the purpose of overrideAction
 * Before we would remove the value for personal secret when user toggle and user couldn't get it back
 * They have to reload the browser or go back all over again
 * Instead when user delete we raise a flag so if user decides to go back to toggle personal before saving
 * They will get it back
 */
export const DashboardPage = ({ envFromTop }: { envFromTop: string }) => {
  const { subscription } = useSubscription();
  const { t } = useTranslation();
  const router = useRouter();
  const { createNotification } = useNotificationContext();
  const queryClient = useQueryClient();

  const secretContainer = useRef<HTMLDivElement | null>(null);
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "secretDetails",
    "addTag",
    "secretSnapshots",
    "uploadedSecOpts",
    "compareSecrets",
    "folderForm",
    "deleteFolder",
    "upgradePlan"
  ] as const);
  const [isSecretValueHidden, setIsSecretValueHidden] = useToggle(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [snapshotId, setSnaphotId] = useState<string | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<WorkspaceEnv | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const deletedSecretIds = useRef<string[]>([]);
  const { hasUnsavedChanges, setHasUnsavedChanges } = useLeaveConfirm({ initialValue: false });

  const folderId = router.query.folderId as string;
  const isRollbackMode = Boolean(snapshotId);

  const { currentWorkspace, isLoading } = useWorkspace();
  const workspaceId = currentWorkspace?._id as string;
  const { data: latestFileKey } = useGetUserWsKey(workspaceId);

  useEffect(() => {
    if (!isLoading && !workspaceId && router.isReady) {
      router.push("/noprojects");
    }
  }, [isLoading, workspaceId, router.isReady]);

  // fetching data
  const { data: userAction } = useGetUserAction(USER_ACTION_PUSH);
  const hasUserPushed = Boolean(userAction);

  const { data: wsEnv, isLoading: isEnvListLoading } = useGetUserWsEnvironments({
    workspaceId,
    onSuccess: (data) => {
      // get an env with one of the access available
      const env = data.find(({ isReadDenied, isWriteDenied }) => !isWriteDenied || !isReadDenied);
      if (env && data?.map((wsenv) => wsenv.slug).includes(envFromTop)) {
        setSelectedEnv(data?.filter((dp) => dp.slug === envFromTop)[0]);
      }
    }
  });

  const { data: secretVersion } = useGetSecretVersion({
    limit: 10,
    offset: 0,
    secretId: (popUp?.secretDetails?.data as TSecretDetailsOpen)?.id,
    decryptFileKey: latestFileKey!
  });

  const { data: secrets, isLoading: isSecretsLoading } = useGetProjectSecrets({
    workspaceId,
    env: selectedEnv?.slug || "",
    decryptFileKey: latestFileKey!,
    isPaused: Boolean(snapshotId),
    folderId
  });

  const { data: folderData, isLoading: isFoldersLoading } = useGetProjectFolders({
    workspaceId: workspaceId || "",
    environment: selectedEnv?.slug || "",
    parentFolderId: folderId,
    isPaused: isRollbackMode,
    sortDir
  });

  const {
    data: secretSnaphots,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useGetWorkspaceSecretSnapshots({
    workspaceId,
    environment: selectedEnv?.slug || "",
    folder: folderId,
    limit: 10
  });

  const {
    data: snapshotSecret,
    isLoading: isSnapshotSecretsLoading,
    isFetching: isSnapshotChanging
  } = useGetSnapshotSecrets({
    snapshotId: snapshotId || "",
    env: selectedEnv?.slug || "",
    decryptFileKey: latestFileKey!
  });

  const { data: snapshotCount, isLoading: isLoadingSnapshotCount } = useGetWsSnapshotCount(
    workspaceId,
    selectedEnv?.slug || "",
    folderId
  );

  const { data: wsTags } = useGetWsTags(workspaceId);
  // mutation calls
  const { mutateAsync: batchSecretOp } = useBatchSecretsOp();
  const { mutateAsync: performSecretRollback } = usePerformSecretRollback();
  const { mutateAsync: registerUserAction } = useRegisterUserAction();
  const { mutateAsync: createWsTag } = useCreateWsTag();
  const { mutateAsync: createFolder } = useCreateFolder();
  const { mutateAsync: updateFolder } = useUpdateFolder(folderId);
  const { mutateAsync: deleteFolder } = useDeleteFolder(folderId);

  const method = useForm<FormData>({
    // why any: well yup inferred ts expects other keys to defined as undefined
    defaultValues: secrets as any,
    values: secrets as any,
    mode: "onBlur",
    resolver: yupResolver(schema)
  });

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    formState: { isSubmitting, isDirty },
    reset
  } = method;
  const { fields, prepend, append, remove } = useFieldArray({ control, name: "secrets" });
  const isReadOnly = selectedEnv?.isWriteDenied;
  const isAddOnly = selectedEnv?.isReadDenied && !selectedEnv?.isWriteDenied;
  const canDoRollback = !isReadOnly && !isAddOnly;
  const isSubmitDisabled = isReadOnly || (!isRollbackMode && !isDirty) || isAddOnly || isSubmitting;

  useEffect(() => {
    if (!isSnapshotChanging && Boolean(snapshotId)) {
      reset({ secrets: snapshotSecret?.secrets, isSnapshotMode: true });
    }
  }, [isSnapshotChanging]);

  useEffect(() => {
    setHasUnsavedChanges(!isSubmitDisabled);
  }, [isSubmitDisabled]);

  const onSortSecrets = () => {
    const dir = sortDir === "asc" ? "desc" : "asc";
    const sec = getValues("secrets") || [];
    const sortedSec = sec.sort((a, b) =>
      dir === "asc" ? a?.key?.localeCompare(b?.key || "") : b?.key?.localeCompare(a?.key || "")
    );
    setValue("secrets", sortedSec);
    setSortDir(dir);
  };

  const handleUploadedEnv = (uploadedSec: TSecOverwriteOpt["secrets"]) => {
    const sec = getValues("secrets") || [];
    const conflictingSec = sec.filter(({ key }) => Boolean(uploadedSec?.[key]));
    const conflictingSecIds = conflictingSec.reduce<Record<string, boolean>>(
      (prev, curr) => ({
        ...prev,
        [curr.key]: true
      }),
      {}
    );
    // filter to get all conflicting ones
    const conflictingUploadedSec = { ...uploadedSec };
    // append non conflicting ones
    Object.keys(uploadedSec).forEach((key) => {
      if (!conflictingSecIds?.[key]) {
        delete conflictingUploadedSec[key];
        sec.push({
          ...DEFAULT_SECRET_VALUE,
          key,
          value: uploadedSec[key].value,
          comment: uploadedSec[key].comments.join(",")
        });
      }
    });
    setValue("secrets", sec, { shouldDirty: true });
    if (conflictingSec.length > 0) {
      handlePopUpOpen("uploadedSecOpts", { secrets: conflictingUploadedSec });
    }
  };

  const onOverwriteSecrets = () => {
    const sec = getValues("secrets") || [];
    const uploadedSec = (popUp?.uploadedSecOpts?.data as TSecOverwriteOpt)?.secrets;
    const data: Array<{ key: string; index: number }> = [];
    sec.forEach(({ key }, index) => {
      if (uploadedSec?.[key]) data.push({ key, index });
    });
    data.forEach(({ key, index }) => {
      const { value, comments } = uploadedSec[key];
      const comment = comments.join(", ");
      sec[index] = {
        ...DEFAULT_SECRET_VALUE,
        key,
        value,
        comment,
        tags: sec[index].tags
      };
    });
    setValue("secrets", sec, { shouldDirty: true });
    handlePopUpClose("uploadedSecOpts");
  };

  const onSecretRollback = async () => {
    if (!snapshotSecret?.version) {
      createNotification({
        text: "Failed to find secret version",
        type: "success"
      });
      return;
    }
    try {
      await performSecretRollback({
        workspaceId,
        version: snapshotSecret.version,
        environment: selectedEnv?.slug || "",
        folderId
      });
      setValue("isSnapshotMode", false);
      setSnaphotId(null);
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret(workspaceId, selectedEnv?.slug || "")
      );
      createNotification({
        text: "Successfully rollback secrets",
        type: "success"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        text: "Failed to rollback secrets",
        type: "error"
      });
    }
  };

  const onAppendSecret = () => append(DEFAULT_SECRET_VALUE);

  const onSaveSecret = async ({ secrets: userSec = [], isSnapshotMode }: FormData) => {
    if (isSnapshotMode) {
      await onSecretRollback();
      return;
    }
    // just closing this if save is triggered from drawer
    handlePopUpClose("secretDetails");
    // when add only mode remove rest of things not created
    const sec = isAddOnly ? userSec.filter(({ _id }) => !_id) : userSec;
    // encrypt and format the secrets to batch api format
    // requests = [ {method:"", secret:""} ]
    const batchedSecret = transformSecretsToBatchSecretReq(
      deletedSecretIds.current,
      latestFileKey,
      sec,
      secrets?.secrets
    );
    // type check
    if (!selectedEnv?.slug) return;
    try {
      await batchSecretOp({
        requests: batchedSecret,
        workspaceId,
        folderId,
        environment: selectedEnv?.slug
      });
      createNotification({
        text: "Successfully saved changes",
        type: "success"
      });
      deletedSecretIds.current = [];
      if (!hasUserPushed) {
        await registerUserAction(USER_ACTION_PUSH);
      }
    } catch (error) {
      console.log(error);
      createNotification({
        text: "Failed to save changes",
        type: "error"
      });
    }
  };

  const onDrawerOpen = (dto: TSecretDetailsOpen) => {
    handlePopUpOpen("secretDetails", dto);
  };

  const onEnvChange = (slug: string) => {
    if (hasUnsavedChanges) {
      // eslint-disable-next-line no-alert
      if (!window.confirm(leaveConfirmDefaultMessage)) return;
    }
    const env = wsEnv?.find((el) => el.slug === slug);
    if (env) setSelectedEnv(env);
    const query: Record<string, string> = { ...router.query, env: slug };
    delete query.folderId;
    router.push({
      pathname: router.pathname,
      query
    });
  };

  // record all deleted ids
  // This will make final deletion easier
  const onSecretDelete = (index: number, id?: string, overrideId?: string) => {
    if (id) deletedSecretIds.current.push(id);
    if (overrideId) deletedSecretIds.current.push(overrideId);
    remove(index);
    // just the case if this is called from drawer
    handlePopUpClose("secretDetails");
  };

  const onCreateWsTag = async (tagName: string) => {
    try {
      await createWsTag({
        workspaceID: workspaceId,
        tagName,
        tagSlug: tagName.replace(" ", "_")
      });
      handlePopUpClose("addTag");
      createNotification({
        text: "Successfully created a tag",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to create a tag",
        type: "error"
      });
    }
  };

  const handleFolderOpen = (id: string) => {
    setSearchFilter("");
    router.push({
      pathname: router.pathname,
      query: {
        ...router.query,
        folderId: id
      }
    });
  };

  const isEditFolder = Boolean(popUp?.folderForm?.data);

  const handleFolderCreate = async (name: string) => {
    try {
      await createFolder({
        workspaceId,
        environment: selectedEnv?.slug || "",
        folderName: name,
        parentFolderId: folderId
      });
      createNotification({
        type: "success",
        text: "Successfully created folder"
      });
      handlePopUpClose("folderForm");
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to create folder",
        type: "error"
      });
    }
  };

  const handleFolderUpdate = async (name: string) => {
    const { id } = popUp?.folderForm?.data as TDeleteFolderForm;
    try {
      await updateFolder({
        folderId: id,
        workspaceId,
        environment: selectedEnv?.slug || "",
        name
      });
      createNotification({
        type: "success",
        text: "Successfully updated folder"
      });
      handlePopUpClose("folderForm");
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to update folder",
        type: "error"
      });
    }
  };

  const handleFolderDelete = async () => {
    const { id } = popUp?.deleteFolder?.data as TDeleteFolderForm;
    try {
      deleteFolder({
        workspaceId,
        environment: selectedEnv?.slug || "",
        folderId: id
      });
      createNotification({
        type: "success",
        text: "Successfully removed folder"
      });
      handlePopUpClose("deleteFolder");
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to remove folder",
        type: "error"
      });
    }
  };

  // when secrets is not loading and secrets list is empty
  const isDashboardSecretEmpty = !isSecretsLoading && !fields?.length;

  // folder list checks
  const isFolderListLoading = isRollbackMode ? isSnapshotSecretsLoading : isFoldersLoading;
  const folderList = isRollbackMode ? snapshotSecret?.folders : folderData?.folders;

  // when using snapshot mode and snapshot is loading and snapshot list is empty
  const isFoldersEmpty = !isFolderListLoading && !folderList?.length;
  const isSnapshotSecretEmtpy =
    isRollbackMode && !isSnapshotSecretsLoading && !snapshotSecret?.secrets?.length;
  const isSecretEmpty = (!isRollbackMode && isDashboardSecretEmpty) || isSnapshotSecretEmtpy;
  const isEmptyPage = isFoldersEmpty && isSecretEmpty;

  if (isSecretsLoading || isEnvListLoading) {
    return (
      <div className="container mx-auto flex h-1/2 w-full items-center justify-center px-8 text-mineshaft-50 dark:[color-scheme:dark]">
        <img src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
      </div>
    );
  }

  const userAvailableEnvs = wsEnv?.filter(
    ({ isReadDenied, isWriteDenied }) => !isReadDenied || !isWriteDenied
  );

  return (
    <div className="container mx-auto h-full px-6 text-mineshaft-50 dark:[color-scheme:dark]">
      <FormProvider {...method}>
        <form autoComplete="off" className="h-full">
          {/* breadcrumb row */}
          <div className="relative right-6 -top-2 mb-2 ml-6">
            <NavHeader
              pageName={t("dashboard.title")}
              currentEnv={
                userAvailableEnvs?.filter((envir) => envir.slug === envFromTop)[0].name || ""
              }
              isFolderMode
              folders={folderData?.dir}
              isProjectRelated
              userAvailableEnvs={userAvailableEnvs}
              onEnvChange={onEnvChange}
            />
          </div>
          <div className="mb-4">
            <h6 className="text-2xl">{isRollbackMode ? "Secret Snapshot" : ""}</h6>
            {isRollbackMode && Boolean(snapshotSecret) && (
              <Tag colorSchema="green">
                {new Date(snapshotSecret?.createdAt || "").toLocaleString()}
              </Tag>
            )}
          </div>
          {/* Environment, search and other action row */}
          <div className="flex items-center justify-between space-x-2">
            <div className="flex max-w-lg flex-grow space-x-2">
              <Input
                className="h-[2.3rem] bg-mineshaft-800 placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
                placeholder="Search by folder name, key name, comment..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              />
            </div>
            <div className="flex items-center space-x-2">
              <div>
                <Popover>
                  <PopoverTrigger asChild>
                    <IconButton ariaLabel="download" variant="outline_bg">
                      <FontAwesomeIcon icon={faDownload} />
                    </IconButton>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto border border-mineshaft-600 bg-mineshaft-800 p-1"
                    hideCloseBtn
                  >
                    <div className="flex flex-col space-y-2">
                      <Button
                        onClick={() => downloadSecret(getValues("secrets"), selectedEnv?.slug)}
                        colorSchema="primary"
                        variant="outline_bg"
                        className="h-8 bg-bunker-700"
                      >
                        Download as .env
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Tooltip content={isSecretValueHidden ? "Reveal Secrets" : "Hide secrets"}>
                  <IconButton
                    ariaLabel="reveal"
                    variant="outline_bg"
                    onClick={() => setIsSecretValueHidden.toggle()}
                  >
                    <FontAwesomeIcon icon={isSecretValueHidden ? faEye : faEyeSlash} />
                  </IconButton>
                </Tooltip>
              </div>
              <div className="block xl:hidden">
                <Tooltip content="Point-in-time Recovery">
                  <IconButton
                    ariaLabel="recovery"
                    variant="outline_bg"
                    onClick={() => handlePopUpOpen("secretSnapshots")}
                  >
                    <FontAwesomeIcon icon={faCodeCommit} />
                  </IconButton>
                </Tooltip>
              </div>
              <div className="hidden xl:block">
                <Button
                  variant="outline_bg"
                  onClick={() => {
                    if (subscription && subscription.pitRecovery) {
                      handlePopUpOpen("secretSnapshots");
                      return;
                    }
                    
                    handlePopUpOpen("upgradePlan");
                  }}
                  leftIcon={<FontAwesomeIcon icon={faCodeCommit} />}
                  isLoading={isLoadingSnapshotCount}
                  isDisabled={!canDoRollback}
                  className="h-10"
                >
                  {snapshotCount} Commits
                </Button>
              </div>
              {!isReadOnly && !isRollbackMode && (
                <>
                  <div className="block lg:hidden">
                    <Tooltip content="Add Folder">
                      <IconButton
                        ariaLabel="recovery"
                        variant="outline_bg"
                        onClick={() => handlePopUpOpen("folderForm")}
                      >
                        <FontAwesomeIcon icon={faFolderPlus} />
                      </IconButton>
                    </Tooltip>
                  </div>

                  <div className="block lg:hidden">
                    <Tooltip content="Point-in-time Recovery">
                      <IconButton
                        ariaLabel="recovery"
                        variant="outline_bg"
                        onClick={() => {
                          if (secretContainer.current) {
                            secretContainer.current.scroll({
                              top: 0,
                              behavior: "smooth"
                            });
                          }
                          prepend(DEFAULT_SECRET_VALUE, { shouldFocus: false });
                        }}
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </IconButton>
                    </Tooltip>
                  </div>
                  <div className="hidden lg:block">
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faFolderPlus} />}
                      onClick={() => handlePopUpOpen("folderForm")}
                      isDisabled={isReadOnly || isRollbackMode}
                      variant="outline_bg"
                      className="h-10"
                    >
                      Add Folder
                    </Button>
                  </div>

                  <div className="hidden lg:block">
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                      onClick={() => {
                        if (secretContainer.current) {
                          secretContainer.current.scroll({
                            top: 0,
                            behavior: "smooth"
                          });
                        }
                        prepend(DEFAULT_SECRET_VALUE, { shouldFocus: false });
                      }}
                      isDisabled={isReadOnly || isRollbackMode}
                      variant="outline_bg"
                      className="h-10"
                    >
                      Add Secret
                    </Button>
                  </div>
                </>
              )}
              {isRollbackMode && (
                <Button
                  variant="star"
                  leftIcon={<FontAwesomeIcon icon={faArrowLeft} />}
                  onClick={() => {
                    setSnaphotId(null);
                    reset({ ...secrets, isSnapshotMode: false });
                  }}
                  className="h-10"
                >
                  Go back
                </Button>
              )}
              <Button
                isDisabled={isSubmitDisabled}
                isLoading={isSubmitting}
                leftIcon={<FontAwesomeIcon icon={isRollbackMode ? faClockRotateLeft : faCheck} />}
                onClick={handleSubmit(onSaveSecret)}
                className="h-10 text-black"
                color="primary"
                variant="solid"
              >
                {isRollbackMode ? "Rollback" : "Save Changes"}
              </Button>
            </div>
          </div>
          <div
            className={`${
              isEmptyPage ? "flex flex-col items-center justify-center" : ""
            } no-scrollbar::-webkit-scrollbar mt-3 h-3/4 overflow-x-hidden overflow-y-scroll no-scrollbar`}
            ref={secretContainer}
          >
            {!isEmptyPage && (
              <TableContainer className="no-scrollbar::-webkit-scrollbar max-h-[calc(100%-120px)] no-scrollbar">
                <table className="secret-table relative">
                  <SecretTableHeader sortDir={sortDir} onSort={onSortSecrets} />
                  <tbody className="max-h-96 overflow-y-auto">
                    <FolderSection
                      onFolderOpen={handleFolderOpen}
                      onFolderUpdate={(id, name) => handlePopUpOpen("folderForm", { id, name })}
                      onFolderDelete={(id, name) => handlePopUpOpen("deleteFolder", { id, name })}
                      folders={folderList}
                      search={searchFilter}
                    />
                    {fields.map(({ id, _id }, index) => (
                      <SecretInputRow
                        key={id}
                        isReadOnly={isReadOnly}
                        isRollbackMode={isRollbackMode}
                        isAddOnly={isAddOnly}
                        index={index}
                        searchTerm={searchFilter}
                        onSecretDelete={onSecretDelete}
                        onRowExpand={() => onDrawerOpen({ id: _id as string, index })}
                        isSecretValueHidden={isSecretValueHidden}
                        wsTags={wsTags}
                        onCreateTagOpen={() => handlePopUpOpen("addTag")}
                      />
                    ))}
                    {!isReadOnly && !isRollbackMode && (
                      <tr>
                        <td colSpan={3} className="hover:bg-mineshaft-700">
                          <button
                            type="button"
                            className="flex h-8 w-full cursor-default items-center justify-start pl-12 font-normal text-bunker-300"
                            onClick={onAppendSecret}
                          >
                            <FontAwesomeIcon icon={faPlus} />
                            <span className="ml-2 w-20">Add Secret</span>
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TableContainer>
            )}
            <PitDrawer
              isDrawerOpen={popUp?.secretSnapshots?.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("secretSnapshots", isOpen)}
              fetchNextPage={fetchNextPage}
              hasNextPage={hasNextPage}
              snapshotId={snapshotId}
              isFetchingNextPage={isFetchingNextPage}
              secretSnaphots={secretSnaphots}
              onSelectSnapshot={setSnaphotId}
            />
            <SecretDetailDrawer
              onSave={handleSubmit(onSaveSecret)}
              isReadOnly={isReadOnly || isRollbackMode}
              onSecretDelete={onSecretDelete}
              isDrawerOpen={popUp?.secretDetails?.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("secretDetails", isOpen)}
              secretVersion={secretVersion}
              index={(popUp?.secretDetails?.data as TSecretDetailsOpen)?.index}
              onEnvCompare={(key) => handlePopUpOpen("compareSecrets", key)}
            />
            <SecretDropzone
              isSmaller={!isEmptyPage}
              onParsedEnv={handleUploadedEnv}
              onAddNewSecret={onAppendSecret}
            />
          </div>
          {/* secrets table and drawers, modals */}
        </form>
        {/* Create a new tag modal */}
        <Modal
          isOpen={popUp?.addTag?.isOpen}
          onOpenChange={(open) => {
            handlePopUpToggle("addTag", open);
          }}
        >
          <ModalContent
            title="Create tag"
            subTitle="Specify your tag name, and the slug will be created automatically."
          >
            <CreateTagModal onCreateTag={onCreateWsTag} />
          </ModalContent>
        </Modal>
        {/* Uploaded env override or not confirmation modal */}
        <Modal
          isOpen={popUp?.uploadedSecOpts?.isOpen}
          onOpenChange={(open) => handlePopUpToggle("uploadedSecOpts", open)}
        >
          <ModalContent
            title="Duplicate Secrets"
            footerContent={[
              <Button
                key="keep-old-btn"
                className="mr-4"
                onClick={() => handlePopUpClose("uploadedSecOpts")}
              >
                Keep old
              </Button>,
              <Button colorSchema="danger" key="overwrite-btn" onClick={onOverwriteSecrets}>
                Overwrite
              </Button>
            ]}
          >
            <div className="flex flex-col space-y-2 text-gray-300">
              <div>Your file contains following duplicate secrets</div>
              <div className="text-sm text-gray-400">
                {Object.keys((popUp?.uploadedSecOpts?.data as TSecOverwriteOpt)?.secrets || {})
                  ?.map((key) => key)
                  .join(", ")}
              </div>
              <div>Are you sure you want to overwrite these secrets?</div>
            </div>
          </ModalContent>
        </Modal>
        <Modal
          isOpen={popUp?.folderForm?.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("folderForm", isOpen)}
        >
          <ModalContent title={isEditFolder ? "Edit Folder" : "Create Folder"}>
            <FolderForm
              isEdit={isEditFolder}
              onUpdateFolder={handleFolderUpdate}
              onCreateFolder={handleFolderCreate}
              defaultFolderName={(popUp?.folderForm?.data as TEditFolderForm)?.name}
            />
          </ModalContent>
        </Modal>
        <DeleteActionModal
          isOpen={popUp.deleteFolder.isOpen}
          deleteKey={(popUp.deleteFolder?.data as TDeleteFolderForm)?.name}
          title="Do you want to delete this folder?"
          onChange={(isOpen) => handlePopUpToggle("deleteFolder", isOpen)}
          onDeleteApproved={handleFolderDelete}
        />
        <Modal
          isOpen={popUp?.compareSecrets?.isOpen}
          onOpenChange={(open) => handlePopUpToggle("compareSecrets", open)}
        >
          <ModalContent
            title={popUp?.compareSecrets?.data as string}
            subTitle="Below is the comparison of secret values across available environments"
            overlayClassName="z-[90]"
          >
            <CompareSecret
              workspaceId={workspaceId}
              envs={userAvailableEnvs || []}
              secretKey={popUp?.compareSecrets?.data as string}
            />
          </ModalContent>
        </Modal>
      </FormProvider>
      {subscription && (
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={subscription.slug === null ? "You can perform point-in-time recovery under an Enterprise license" : "You can perform point-in-time recovery if you switch to Infisical's Team plan"}
        />
      )}
    </div>
  );
};
