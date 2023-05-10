import { useEffect, useRef, useState } from 'react';
import { 
  // Controller, 
  FormProvider, useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import {
  faArrowLeft,
  faCheck,
  faClockRotateLeft,
  faCodeCommit,
  faDownload,
  faEye,
  faEyeSlash,
  faFolder,
  faMagnifyingGlass,
  faPlus
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { yupResolver } from '@hookform/resolvers/yup';
import { useQueryClient } from '@tanstack/react-query';

import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import NavHeader from '@app/components/navigation/NavHeader';
import {
  Button,
  // FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TableContainer,
  Tag,
  Tooltip
} from '@app/components/v2';
import { leaveConfirmDefaultMessage } from '@app/const';
import { useWorkspace } from '@app/context';
import { useLeaveConfirm, usePopUp, useToggle } from '@app/hooks';
import {
  useBatchSecretsOp,
  useCreateWsTag,
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
  useRegisterUserAction
} from '@app/hooks/api';
import { useFolderOp, useGetProjectFolderById, useGetProjectFolders } from '@app/hooks/api/secretFolders/queries';
import { secretKeys } from '@app/hooks/api/secrets/queries';
import { WorkspaceEnv } from '@app/hooks/api/types';

import { CompareSecret } from './components/CompareSecret';
import { CreateTagModal } from './components/CreateTagModal';
import { PitDrawer } from './components/PitDrawer';
import { SecretDetailDrawer } from './components/SecretDetailDrawer';
import { SecretDropzone } from './components/SecretDropzone';
import { SecretFolderRow } from './components/SecretFolderRow';
import { SecretInputRow } from './components/SecretInputRow';
import { SecretTableHeader } from './components/SecretTableHeader';
import {
  DEFAULT_SECRET_VALUE,
  downloadSecret,
  FormData,
  schema,
  transformSecretsToBatchSecretReq,
  TSecOverwriteOpt,
  TSecretDetailsOpen
} from './DashboardPage.utils';

const USER_ACTION_PUSH = 'first_time_secrets_pushed';

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
  const { t } = useTranslation();
  const router = useRouter();
  const { createNotification } = useNotificationContext();
  const queryClient = useQueryClient();

  const secretContainer = useRef<HTMLDivElement | null>(null);
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    'secretDetails',
    'addTag',
    'secretSnapshots',
    'uploadedSecOpts',
    'compareSecrets',
    'createUpdateFolder',
    'deleteFolder'
  ] as const);
  const [isSecretValueHidden, setIsSecretValueHidden] = useToggle(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [snapshotId, setSnaphotId] = useState<string | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<WorkspaceEnv | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const deletedSecretIds = useRef<string[]>([]);
  const { hasUnsavedChanges, setHasUnsavedChanges } = useLeaveConfirm({ initialValue: false });

  const { currentWorkspace, isLoading } = useWorkspace();
  const workspaceId = currentWorkspace?._id as string;
  const { data: latestFileKey } = useGetUserWsKey(workspaceId);

  useEffect(() => {
    if (!isLoading && !workspaceId && router.isReady) {
      router.push('/noprojects');
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

  let folderInfo: any;
  let isFolderInfoLoading;
  if (router.query.folder) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data: folderInfoTemp, isLoading: isFolderInfoLoadingTemp } = useGetProjectFolderById({
      workspaceId,
      env: selectedEnv?.slug || '',
      folderId: String(router.query.folder),
      isPaused: Boolean(snapshotId)
    });
    folderInfo = folderInfoTemp;
    isFolderInfoLoading = isFolderInfoLoadingTemp;
  
    console.log(98765, folderInfo, isFolderInfoLoading)
  }

  console.log('getting secrets in', folderInfo?.path || "/")
  const { data: secrets, isLoading: isSecretsLoading } = useGetProjectSecrets({
    workspaceId,
    env: selectedEnv?.slug || '',
    secretsPath: folderInfo?.path || "/",
    decryptFileKey: latestFileKey!,
    isPaused: Boolean(snapshotId)
  });

  const { data: folders, isLoading: isFoldersLoading } = useGetProjectFolders({
    workspaceId,
    env: selectedEnv?.slug || '',
    secretsPath: folderInfo?.path || "/",
    decryptFileKey: latestFileKey!,
    isPaused: Boolean(snapshotId)
  });

  console.log(444, folders, isFoldersLoading)

  const {
    data: secretSnaphots,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useGetWorkspaceSecretSnapshots({
    workspaceId,
    limit: 10
  });

  const {
    data: snapshotSecret,
    isLoading: isSnapshotSecretsLoading,
    isFetching: isSnapshotChanging
  } = useGetSnapshotSecrets({
    snapshotId: snapshotId || '',
    env: selectedEnv?.slug || '',
    decryptFileKey: latestFileKey!
  });

  const { data: snapshotCount, isLoading: isLoadingSnapshotCount } =
    useGetWsSnapshotCount(workspaceId);

  console.log(45678, workspaceId)
  const { data: wsTags } = useGetWsTags(workspaceId);
  // mutation calls
  const { mutateAsync: batchSecretOp } = useBatchSecretsOp();
  const { mutateAsync: performSecretRollback } = usePerformSecretRollback();
  const { mutateAsync: registerUserAction } = useRegisterUserAction();
  const { mutateAsync: createWsTag } = useCreateWsTag();
  const { mutateAsync: addFolder } = useFolderOp();

  const method = useForm<FormData>({
    // why any: well yup inferred ts expects other keys to defined as undefined
    defaultValues: secrets as any,
    values: secrets as any,
    mode: 'onBlur',
    resolver: yupResolver(schema)
  });

  const methodFolders = useForm<FormData>({
    // why any: well yup inferred ts expects other keys to defined as undefined
    defaultValues: folders as any,
    values: folders as any,
    mode: 'onBlur',
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

  const {
    control: controlFolders,
    // handleSubmit: handleSubmitFolders,
    // getValues: getValuesFolders,
    // setValue: setValueFolders,
    // formState: { isFoldersSubmitting, isFoldersDirty },
    // reset: resetFolders
  } = methodFolders;
  const { fields, prepend, append, remove } = useFieldArray({ control, name: 'secrets' });
  const { 
    fields: fieldsFolders, 
    prepend: prependFolders, 
    // append: appendFolders, 
    // remove: removeFolders,
    update: updateFolders
  } = useFieldArray({ control: controlFolders, name: 'folders' });
  console.log(777, fields, fieldsFolders)
  const isRollbackMode = Boolean(snapshotId);
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
    const dir = sortDir === 'asc' ? 'desc' : 'asc';
    const sec = getValues('secrets') || [];
    const sortedSec = sec.sort((a, b) =>
      dir === 'asc' ? a?.key?.localeCompare(b?.key || '') : b?.key?.localeCompare(a?.key || '')
    );
    setValue('secrets', sortedSec);
    setSortDir(dir);
  };

  const handleUploadedEnv = (uploadedSec: TSecOverwriteOpt['secrets']) => {
    const sec = getValues('secrets') || [];
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
          comment: uploadedSec[key].comments.join(',')
        });
      }
    });
    setValue('secrets', sec, { shouldDirty: true });
    if (conflictingSec.length > 0) {
      handlePopUpOpen('uploadedSecOpts', { secrets: conflictingUploadedSec });
    }
  };

  const onOverwriteSecrets = () => {
    const sec = getValues('secrets') || [];
    const uploadedSec = (popUp?.uploadedSecOpts?.data as TSecOverwriteOpt)?.secrets;
    const data: Array<{ key: string; index: number }> = [];
    sec.forEach(({ key }, index) => {
      if (uploadedSec?.[key]) data.push({ key, index });
    });
    data.forEach(({ key, index }) => {
      const { value, comments } = uploadedSec[key];
      const comment = comments.join(', ');
      sec[index] = {
        ...DEFAULT_SECRET_VALUE,
        key,
        value,
        comment,
        tags: sec[index].tags
      };
    });
    setValue('secrets', sec, { shouldDirty: true });
    handlePopUpClose('uploadedSecOpts');
  };

  const onSecretRollback = async () => {
    if (!snapshotSecret?.version) {
      createNotification({
        text: 'Failed to find secret version',
        type: 'success'
      });
      return;
    }
    try {
      await performSecretRollback({
        workspaceId,
        version: snapshotSecret.version
      });
      setValue('isSnapshotMode', false);
      setSnaphotId(null);
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret(workspaceId, selectedEnv?.slug || '', folderInfo?.path)
      );
      createNotification({
        text: 'Successfully rollback secrets',
        type: 'success'
      });
    } catch (error) {
      console.log(error);
      createNotification({
        text: 'Failed to rollback secrets',
        type: 'error'
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
    handlePopUpClose('secretDetails');
    // when add only mode remove rest of things not created
    const sec = isAddOnly ? userSec.filter(({ _id }) => !_id) : userSec;
    // encrypt and format the secrets to batch api format
    // requests = [ {method:"", secret:""} ]
    fieldsFolders.filter(folder => !folder._id).map(async (folder) => { 
      await addFolder({
        workspaceId,
        environment: String(selectedEnv?.slug),
        folderName: String(folder.name)
      })
    })
    const batchedSecret = transformSecretsToBatchSecretReq(
      deletedSecretIds.current,
      latestFileKey,
      sec,
      String(router.query.folder),
      secrets?.secrets,
    );
    // type check
    if (!selectedEnv?.slug) return;
    try {
      console.log(5, {
        requests: batchedSecret,
        secretsPath: folderInfo?.path || "/",
        workspaceId,
        environment: selectedEnv?.slug
      })
      await batchSecretOp({
        requests: batchedSecret,
        secretsPath: folderInfo?.path || "/",
        workspaceId,
        environment: selectedEnv?.slug
      });
      createNotification({
        text: 'Successfully saved changes',
        type: 'success'
      });
      deletedSecretIds.current = [];
      if (!hasUserPushed) {
        await registerUserAction(USER_ACTION_PUSH);
      }
    } catch (error) {
      console.log(error);
      createNotification({
        text: 'Failed to save changes',
        type: 'error'
      });
    }
  };

  const onDrawerOpen = (dto: TSecretDetailsOpen) => {
    handlePopUpOpen('secretDetails', dto);
  };

  const onEnvChange = (slug: string) => {
    if (hasUnsavedChanges) {
      // eslint-disable-next-line no-alert
      if (!window.confirm(leaveConfirmDefaultMessage)) return;
    }
    const env = wsEnv?.find((el) => el.slug === slug);
    if (env) setSelectedEnv(env);
    router.push({
      pathname: router.pathname,
      query: { ...router.query, env: slug }
    });
  };

  // record all deleted ids
  // This will make final deletion easier
  const onSecretDelete = (index: number, id?: string, overrideId?: string) => {
    if (id) deletedSecretIds.current.push(id);
    if (overrideId) deletedSecretIds.current.push(overrideId);
    remove(index);
    // just the case if this is called from drawer
    handlePopUpClose('secretDetails');
  };

  const onCreateWsTag = async (tagName: string) => {
    try {
      await createWsTag({
        workspaceID: workspaceId,
        tagName,
        tagSlug: tagName.replace(' ', '_')
      });
      handlePopUpClose('addTag');
      createNotification({
        text: 'Successfully created a tag',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to create a tag',
        type: 'error'
      });
    }
  };

  if (isSecretsLoading || isEnvListLoading) {
    return (
      <div className="container mx-auto flex h-1/2 w-full items-center justify-center px-8 text-mineshaft-50 dark:[color-scheme:dark]">
        <img src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
      </div>
    );
  }

  const isFolderUpdate = Boolean(popUp?.createUpdateFolder?.data);
  // const oldFolderName = (popUp?.createUpdateFolder?.data as { slug: string })?.slug;
  const onFolderModalSubmit = async (data: any) => {
    console.log('checkcheckcheckcheck', isFolderUpdate)
    if (isFolderUpdate) {
      console.log('updating', data.id)
      // removeFolders(data.id)
      updateFolders(fieldsFolders.map(folder => folder.id).indexOf(data.id), {
        // id: data.id,
        _id: data._id,
        name: data.name,
      });
    } else {
      // await onCreate(data);
      if (secretContainer.current) {
        secretContainer.current.scroll({
          top: 0,
          behavior: 'smooth'
        });
      }
      console.log(555666)
      prependFolders({
        _id: undefined,
        name: data.name,
      }, { shouldFocus: false });
    }
    handlePopUpClose('createUpdateFolder');
  };

  // const onFolderDeleteSubmit = async (envSlug: string) => {
  //   await onDelete(envSlug);
  //   handlePopUpClose('deleteFolder');
  // };

  // when secrets is not loading and secrets list is empty
  const isDashboardSecretEmpty = !isSecretsLoading && false;
  // when using snapshot mode and snapshot is loading and snapshot list is empty
  const isSnapshotSecretEmtpy =
    isRollbackMode && !isSnapshotSecretsLoading && !snapshotSecret?.secrets?.length;
  const isSecretEmpty = (!isRollbackMode && isDashboardSecretEmpty) || isSnapshotSecretEmtpy;

  const userAvailableEnvs = wsEnv?.filter(
    ({ isReadDenied, isWriteDenied }) => !isReadDenied || !isWriteDenied
  );

  return (
    <div className="mr-auto container px-6 text-mineshaft-50 dark:[color-scheme:dark] h-full">
      <FormProvider {...method}>
        <form autoComplete="off">
          {/* breadcrumb row */}
          <div className="relative right-6 mb-6 -top-2">
            <NavHeader
              pageName={t('dashboard:title')}
              currentEnv={
                userAvailableEnvs?.filter((envir) => envir.slug === envFromTop)[0].name || ''
              }
              isProjectRelated
              userAvailableEnvs={userAvailableEnvs}
              onEnvChange={onEnvChange}
              secretsPath={folderInfo?.path || "/"}
            />
          </div>
          {/* This is only for rollbacks */}
          {isRollbackMode && 
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h1 className="text-3xl font-semibold">Secret Snapshot</h1>
                {isRollbackMode && Boolean(snapshotSecret) && (
                  <Tag colorSchema="green">
                    {new Date(snapshotSecret?.createdAt || '').toLocaleString()}
                  </Tag>
                )}
              </div>
              <div className="flex items-center space-x-2">
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
              </div>
            </div>}
          {/* Environment, search and other action row */}
          <div className="mt-2 flex items-center space-x-2 justify-between">
            <div className="flex-grow max-w-sm">
              <Input
                className="h-[2.3rem] bg-mineshaft-800 focus:bg-mineshaft-700/80 duration-200 placeholder-mineshaft-50"
                placeholder="Search keys..."
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
                        onClick={() => downloadSecret(getValues('secrets'), selectedEnv?.slug)}
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
                <Tooltip content={isSecretValueHidden ? 'Reveal Secrets' : 'Hide secrets'}>
                  <IconButton
                    ariaLabel="reveal"
                    variant="outline_bg"
                    onClick={() => setIsSecretValueHidden.toggle()}
                  >
                    <FontAwesomeIcon icon={isSecretValueHidden ? faEye : faEyeSlash} />
                  </IconButton>
                </Tooltip>
              </div>
              <div className='block xl:hidden'>
                <Tooltip content='Point-in-time Recovery'>
                  <IconButton
                    ariaLabel="recovery"
                    variant="outline_bg"
                    onClick={() => setIsSecretValueHidden.toggle()}
                  >
                    <FontAwesomeIcon icon={faCodeCommit} />
                  </IconButton>
                </Tooltip>
              </div>
              <div className='hidden xl:block'>
                <Button
                  variant="outline_bg"
                  onClick={() => handlePopUpOpen('secretSnapshots')}
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
                  <div className='block lg:hidden'>
                    <Tooltip content='Add Secret'>
                      <IconButton
                        ariaLabel="recovery"
                        variant="outline_bg"
                        onClick={() => {
                          if (secretContainer.current) {
                            secretContainer.current.scroll({
                              top: 0,
                              behavior: 'smooth'
                            });
                          }
                          prepend(DEFAULT_SECRET_VALUE, { shouldFocus: false });
                        }}
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </IconButton>
                    </Tooltip>
                  </div>
                  <div className='hidden lg:block'>
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                      onClick={() => {
                        if (secretContainer.current) {
                          secretContainer.current.scroll({
                            top: 0,
                            behavior: 'smooth'
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
                  <div className=''>
                    <Tooltip content='Add Folder'>
                      <IconButton
                        ariaLabel="recovery"
                        variant="outline_bg"
                        onClick={() => {
                          handlePopUpOpen('createUpdateFolder', undefined)
                        }}
                      >
                        <FontAwesomeIcon icon={faPlus} />
                        <FontAwesomeIcon icon={faFolder} className="pl-2"/>
                      </IconButton>
                    </Tooltip>
                  </div>
                </>
              )}
              <Button
                isDisabled={isSubmitDisabled}
                isLoading={isSubmitting}
                leftIcon={<FontAwesomeIcon icon={isRollbackMode ? faClockRotateLeft : faCheck} />}
                onClick={handleSubmit(onSaveSecret)}
                className="h-10"
              >
                {isRollbackMode ? 'Rollback' : 'Save Changes'}
              </Button>
            </div>
          </div>
          <div
            className={`${
              isSecretEmpty ? 'flex flex-col items-center justify-center' : ''
            } no-scrollbar::-webkit-scrollbar mt-3 h-[calc(100vh-220px)] overflow-x-hidden overflow-y-scroll no-scrollbar`}
            ref={secretContainer}
          >
            {!isSecretEmpty && (
              <TableContainer className="max-h-[calc(100%-40px)] no-scrollbar no-scrollbar::-webkit-scrollbar">
                <table className="secret-table relative">
                  <SecretTableHeader sortDir={sortDir} onSort={onSortSecrets} />
                  <tbody className="max-h-96 overflow-y-auto">
                    {/* ["Folder 1", "Folder 2", "Folder 3"] */}
                    {fieldsFolders.map(({ _id, name }, index) => (
                      <SecretFolderRow
                        key={_id}
                        index={index}
                        _id={String(_id)}
                        handlePopUpOpen={handlePopUpOpen}
                        // index={index}
                        searchTerm={searchFilter}
                        name={String(name)}
                        reset={reset}
                        onFolderDelete={() => {}}
                        // onRowExpand={() => onDrawerOpen({ id: _id as string, index })}
                      />
                    ))}
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
                        onCreateTagOpen={() => handlePopUpOpen('addTag')}
                      />
                    ))}
                    {!isReadOnly && !isRollbackMode && (
                      <tr>
                        <td colSpan={3} className="hover:bg-mineshaft-700">
                          <button
                            type="button"
                            className="pl-12 cursor-default w-full flex h-8 items-center justify-start font-normal text-bunker-300"
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
            <Modal
              isOpen={popUp?.createUpdateFolder?.isOpen}
              onOpenChange={(isOpen) => {
                handlePopUpToggle('createUpdateFolder', isOpen);
                reset();
              }}
            >
              <ModalContent title={isFolderUpdate ? 'Update folder name' : 'Create a new folder'}>
                <form onSubmit={handleSubmit(onFolderModalSubmit)}>
                  {/* <Controller
                    control={control}
                    // defaultValue=""
                    name="folders"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Folder Name"
                        isError={Boolean(error)}
                        errorText={error?.message}
                      >
                        <Input {...field} />
                      </FormControl>
                    )}
                  /> */}
                  <div className="mt-8 flex items-center">
                    <Button
                      className="mr-4"
                      size="sm"
                      type="submit"
                      isLoading={isSubmitting}
                      isDisabled={isSubmitting}
                    >
                      {isFolderUpdate ? 'Update' : 'Create'}
                    </Button>
                    <Button colorSchema="secondary" variant="outline" className="border-none">
                      Cancel
                    </Button>
                  </div>
                </form>
              </ModalContent>
            </Modal>
            <PitDrawer
              isDrawerOpen={popUp?.secretSnapshots?.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle('secretSnapshots', isOpen)}
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
              onOpenChange={(isOpen) => handlePopUpToggle('secretDetails', isOpen)}
              secretVersion={secretVersion}
              index={(popUp?.secretDetails?.data as TSecretDetailsOpen)?.index}
              onEnvCompare={(key) => handlePopUpOpen('compareSecrets', key)}
            />
            <SecretDropzone
              isSmaller={!isSecretEmpty}
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
            handlePopUpToggle('addTag', open);
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
          onOpenChange={(open) => handlePopUpToggle('uploadedSecOpts', open)}
        >
          <ModalContent
            title="Duplicate Secrets"
            footerContent={[
              <Button
                key="keep-old-btn"
                className="mr-4"
                onClick={() => handlePopUpClose('uploadedSecOpts')}
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
                  .join(', ')}
              </div>
              <div>Are you sure you want to overwrite these secrets?</div>
            </div>
          </ModalContent>
        </Modal>
        <Modal
          isOpen={popUp?.compareSecrets?.isOpen}
          onOpenChange={(open) => handlePopUpToggle('compareSecrets', open)}
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
    </div>
  );
};
