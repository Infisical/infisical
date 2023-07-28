import { useCallback, useEffect, useRef, useState } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove } from "@dnd-kit/sortable";
import {
  faAngleDown,
  faArrowLeft,
  faCheck,
  faClockRotateLeft,
  faCodeCommit,
  faDownload,
  faEye,
  faEyeSlash,
  faFileImport,
  faFolderPlus,
  faMagnifyingGlass,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@radix-ui/react-dropdown-menu";
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
import { useOrganization, useSubscription, useWorkspace } from "@app/context";
import { useLeaveConfirm, usePopUp, useToggle } from "@app/hooks";
import {
  useBatchSecretsOp,
  useCreateFolder,
  useCreateSecretImport,
  useCreateWsTag,
  useDeleteFolder,
  useDeleteSecretImport,
  useGetImportedSecrets,
  useGetProjectFolders,
  useGetProjectSecrets,
  useGetSecretImports,
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
  useUpdateFolder,
  useUpdateSecretImport
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
import { SecretImportForm } from "./components/SecretImportForm";
import { SecretImportSection } from "./components/SecretImportSection";
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
type TDeleteSecretImport = { environment: string; secretPath: string };
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
export const DashboardPage = () => {
  const { subscription } = useSubscription();
  const { t } = useTranslation();
  const router = useRouter();
  const { createNotification } = useNotificationContext();
  const queryClient = useQueryClient();
  const envQuery = router.query.env as string;

  const secretContainer = useRef<HTMLDivElement | null>(null);
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "secretDetails",
    "addTag",
    "secretSnapshots",
    "uploadedSecOpts",
    "compareSecrets",
    "folderForm",
    "deleteFolder",
    "upgradePlan",
    "addSecretImport",
    "deleteSecretImport"
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
  const { currentOrg } = useOrganization();
  const workspaceId = currentWorkspace?._id as string;
  const selectedEnvSlug = selectedEnv?.slug || "";

  const { data: latestFileKey } = useGetUserWsKey(workspaceId);

  useEffect(() => {
    if (!isLoading && !workspaceId && router.isReady) {
      router.push(`/org/${currentOrg?._id}/overview`);
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
      if (env && data?.map((wsenv) => wsenv.slug).includes(envQuery)) {
        setSelectedEnv(data?.filter((dp) => dp.slug === envQuery)[0]);
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
    env: selectedEnvSlug,
    decryptFileKey: latestFileKey!,
    isPaused: Boolean(snapshotId),
    folderId
  });

  const { data: folderData, isLoading: isFoldersLoading } = useGetProjectFolders({
    workspaceId: workspaceId || "",
    environment: selectedEnvSlug,
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
    environment: selectedEnvSlug,
    folder: folderId,
    limit: 10
  });

  const {
    data: snapshotSecret,
    isLoading: isSnapshotSecretsLoading,
    isFetching: isSnapshotChanging
  } = useGetSnapshotSecrets({
    snapshotId: snapshotId || "",
    env: selectedEnvSlug,
    decryptFileKey: latestFileKey!
  });

  const { data: snapshotCount, isLoading: isLoadingSnapshotCount } = useGetWsSnapshotCount(
    workspaceId,
    selectedEnvSlug,
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

  const { data: secretImportCfg, isFetching: isSecretImportCfgFetching } = useGetSecretImports(
    workspaceId,
    selectedEnvSlug,
    folderId
  );

  const { data: importedSecrets } = useGetImportedSecrets({
    workspaceId,
    decryptFileKey: latestFileKey!,
    environment: selectedEnvSlug,
    folderId
  });

  // This is for dnd-kit. As react-query state mutation async
  // This will act as a placeholder to avoid a glitching animation on dropping items
  const [items, setItems] = useState<
    Array<{ environment: string; secretPath: string; id: string }>
  >([]);

  useEffect(() => {
    if (
      !isSecretImportCfgFetching ||
      // case in which u go to a folder and come back to fill in with cache data
      (items.length === 0 && secretImportCfg?.imports?.length !== 0 && isSecretImportCfgFetching)
    ) {
      setItems(
        secretImportCfg?.imports?.map((el) => ({
          ...el,
          id: `${el.environment}-${el.secretPath}`
        })) || []
      );
    }
  }, [isSecretImportCfgFetching]);

  const { mutateAsync: createSecretImport } = useCreateSecretImport();
  const { mutate: updateSecretImportSync } = useUpdateSecretImport();
  const { mutateAsync: deleteSecretImport } = useDeleteSecretImport();

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  const method = useForm<FormData>({
    // why any: well yup inferred ts expects other keys to defined as undefined
    defaultValues: secrets as any,
    values: secrets as any,
    mode: "onBlur",
    resolver: yupResolver(schema)
  });

  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    formState: { isSubmitting, isDirty, errors },
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
        environment: selectedEnvSlug,
        folderId
      });
      setValue("isSnapshotMode", false);
      setSnaphotId(null);
      queryClient.invalidateQueries(secretKeys.getProjectSecret(workspaceId, selectedEnvSlug));
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

  const onAppendSecret = () => {
    setSearchFilter("");
    append(DEFAULT_SECRET_VALUE);
  };

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
    if (batchedSecret.length === 0) {
      reset();
      return;
    }
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

  const onDrawerOpen = useCallback((id: string | undefined, index: number) => {
    handlePopUpOpen("secretDetails", { id, index } as TSecretDetailsOpen);
  }, []);

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

  const handleDownloadSecret = () => {
    const secretsFromImport: { key: string; value: string; comment: string }[] = [];
    importedSecrets?.forEach(({ secrets: impSec }) => {
      impSec.forEach((el) => {
        secretsFromImport.push({ key: el.key, value: el.value, comment: el.comment });
      });
    });
    downloadSecret(getValues("secrets"), secretsFromImport, selectedEnv?.slug);
  };

  // record all deleted ids
  // This will make final deletion easier
  const onSecretDelete = useCallback((index: number, id?: string, overrideId?: string) => {
    if (id) deletedSecretIds.current.push(id);
    if (overrideId) deletedSecretIds.current.push(overrideId);
    remove(index);
    // just the case if this is called from drawer
    handlePopUpClose("secretDetails");
  }, []);

  const onCreateWsTag = useCallback(
    async (tagName: string) => {
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
    },
    [workspaceId]
  );

  const handleFolderOpen = useCallback(
    (id: string) => {
      setSearchFilter("");
      router.push({
        pathname: router.pathname,
        query: {
          id: workspaceId,
          env: envQuery,
          folderId: id
        }
      });
    },
    [envQuery, workspaceId]
  );

  const isEditFolder = Boolean(popUp?.folderForm?.data);

  // FOLDER SECTION
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

  const handleFolderUpdate = useCallback(
    async (name: string) => {
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
    },
    [selectedEnv?.slug, (popUp?.folderForm?.data as TDeleteFolderForm)?.id]
  );

  const handleFolderDelete = useCallback(async () => {
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
  }, [selectedEnv?.slug, (popUp?.deleteFolder?.data as TDeleteFolderForm)?.id]);

  // SECRET IMPORT SECTION
  const handleSecretImportCreate = async (env: string, secretPath: string) => {
    try {
      await createSecretImport({
        workspaceId,
        environment: selectedEnv?.slug || "",
        folderId,
        secretImport: {
          environment: env,
          secretPath
        }
      });
      createNotification({
        type: "success",
        text: "Successfully create secret link"
      });
      handlePopUpClose("addSecretImport");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create secret link",
        type: "error"
      });
    }
  };

  const handleSecretImportDelete = async () => {
    const { environment: importEnv, secretPath: impSecPath } = popUp.deleteSecretImport
      ?.data as TDeleteSecretImport;
    try {
      if (secretImportCfg?._id) {
        await deleteSecretImport({
          workspaceId,
          environment: selectedEnvSlug,
          folderId,
          id: secretImportCfg?._id,
          secretImportEnv: importEnv,
          secretImportPath: impSecPath
        });
        handlePopUpClose("deleteSecretImport");
        createNotification({
          type: "success",
          text: "Successfully removed secret link"
        });
      }
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to remove secret link",
        type: "error"
      });
    }
  };

  const handleDragEnd = (evt: DragEndEvent) => {
    const { active, over } = evt;
    if (over?.id && active.id !== over.id) {
      const oldIndex = items.findIndex(({ id }) => id === active.id);
      const newIndex = items.findIndex(({ id }) => id === over.id);
      const newImportOrder = arrayMove(items, oldIndex, newIndex);
      setItems(newImportOrder);
      updateSecretImportSync({
        workspaceId,
        environment: selectedEnvSlug,
        folderId,
        id: secretImportCfg?._id || "",
        secretImports: newImportOrder.map((el) => ({
          environment: el.environment,
          secretPath: el.secretPath
        }))
      });
    }
  };

  // OPTIMIZATION HOOKS PURELY FOR PERFORMANCE AND TO AVOID RE-RENDERING
  const handleCreateTagModalOpen = useCallback(() => handlePopUpOpen("addTag"), []);
  const handleFolderCreatePopUpOpen = useCallback(
    (id: string, name: string) => handlePopUpOpen("folderForm", { id, name }),
    []
  );
  const handleFolderDeletePopUpOpen = useCallback(
    (id: string, name: string) => handlePopUpOpen("deleteFolder", { id, name }),
    []
  );
  const handleSecretImportDelPopUpOpen = useCallback(
    (impSecEnv: string, impSecPath: string) =>
      handlePopUpOpen("deleteSecretImport", {
        environment: impSecEnv,
        secretPath: impSecPath
      }),
    []
  );

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
  const isSecretImportEmpty = !secretImportCfg?.imports?.length;
  const isEmptyPage = isFoldersEmpty && isSecretEmpty && isSecretImportEmpty;

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
      <form autoComplete="off" className="h-full">
        {/* breadcrumb row */}
        <div className="relative right-6 -top-2 mb-2 ml-6">
          <NavHeader
            pageName={t("dashboard.title")}
            currentEnv={userAvailableEnvs?.filter((envir) => envir.slug === envQuery)[0].name || ""}
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
                      onClick={handleDownloadSecret}
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
              <div className="flex flex-row items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    if (!(isReadOnly || isRollbackMode)) {
                      if (secretContainer.current) {
                        secretContainer.current.scroll({
                          top: 0,
                          behavior: "smooth"
                        });
                      }
                      prepend(DEFAULT_SECRET_VALUE, { shouldFocus: false });
                      setSearchFilter("");
                    }
                  }}
                  className="cursor-pointer rounded-l-md border border-mineshaft-500 bg-mineshaft-600 p-2 pr-4 text-sm font-semibold text-mineshaft-300 duration-200 hover:border-primary/40 hover:bg-primary/[0.1]"
                >
                  <FontAwesomeIcon icon={faPlus} className="px-2" />
                  Add Secret
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild className="data-[state=open]:bg-mineshaft-600">
                    <div className="cursor-pointer rounded-r-md border border-mineshaft-500 bg-mineshaft-600 p-2 text-sm text-mineshaft-300 duration-200 hover:border-primary/40 hover:bg-primary/[0.1]">
                      <FontAwesomeIcon icon={faAngleDown} className="pr-2 pl-1.5" />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="left-20 z-[60] mt-1 w-[10.8rem]">
                    <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
                      <div className="w-full pb-1">
                        <Button
                          leftIcon={<FontAwesomeIcon icon={faFolderPlus} />}
                          onClick={() => handlePopUpOpen("folderForm")}
                          isDisabled={isReadOnly || isRollbackMode}
                          variant="outline_bg"
                          className="h-10"
                          isFullWidth
                        >
                          Add Folder
                        </Button>
                      </div>
                      <div className="w-full">
                        <Button
                          leftIcon={<FontAwesomeIcon icon={faFileImport} />}
                          onClick={() => handlePopUpOpen("addSecretImport")}
                          isDisabled={isReadOnly || isRollbackMode}
                          variant="outline_bg"
                          className="h-10"
                          isFullWidth
                        >
                          Add Import
                        </Button>
                      </div>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
            <DndContext
              onDragEnd={handleDragEnd}
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
            >
              <TableContainer className="no-scrollbar::-webkit-scrollbar max-h-[calc(100%-120px)] no-scrollbar">
                <table className="secret-table relative">
                  <SecretTableHeader sortDir={sortDir} onSort={onSortSecrets} />
                  <tbody className="max-h-96 overflow-y-auto">
                    <SecretImportSection
                      onSecretImportDelete={handleSecretImportDelPopUpOpen}
                      secrets={secrets?.secrets}
                      importedSecrets={importedSecrets}
                      items={items}
                    />
                    <FolderSection
                      onFolderOpen={handleFolderOpen}
                      onFolderUpdate={handleFolderCreatePopUpOpen}
                      onFolderDelete={handleFolderDeletePopUpOpen}
                      folders={folderList}
                      search={searchFilter}
                    />
                    {fields.map(({ id, _id }, index) => (
                      <SecretInputRow
                        key={id}
                        secUniqId={_id}
                        isReadOnly={isReadOnly}
                        isRollbackMode={isRollbackMode}
                        isAddOnly={isAddOnly}
                        index={index}
                        searchTerm={searchFilter}
                        onSecretDelete={onSecretDelete}
                        isKeyError={Boolean(errors?.secrets?.[index]?.key?.message)}
                        keyError={errors?.secrets?.[index]?.key?.message}
                        onRowExpand={onDrawerOpen}
                        isSecretValueHidden={isSecretValueHidden}
                        wsTags={wsTags}
                        onCreateTagOpen={handleCreateTagModalOpen}
                        register={register}
                        control={control}
                        setValue={setValue}
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
            </DndContext>
          )}
          <FormProvider {...method}>
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
          </FormProvider>

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
      <Modal
        isOpen={popUp?.addSecretImport?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addSecretImport", isOpen)}
      >
        <ModalContent
          title="Add Secret Link"
          subTitle="To inherit secrets from another environment or folder"
        >
          <SecretImportForm
            environments={currentWorkspace?.environments}
            onCreate={handleSecretImportCreate}
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
      <DeleteActionModal
        isOpen={popUp.deleteSecretImport.isOpen}
        deleteKey="unlink"
        title="Do you want to remove this secret import?"
        subTitle={`This will unlink secrets from environment ${
          (popUp.deleteSecretImport?.data as TDeleteSecretImport)?.environment
        } of path ${(popUp.deleteSecretImport?.data as TDeleteSecretImport)?.secretPath}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteSecretImport", isOpen)}
        onDeleteApproved={handleSecretImportDelete}
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
      {subscription && (
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={
            subscription.slug === null
              ? "You can perform point-in-time recovery under an Enterprise license"
              : "You can perform point-in-time recovery if you switch to Infisical's Team plan"
          }
        />
      )}
    </div>
  );
};
