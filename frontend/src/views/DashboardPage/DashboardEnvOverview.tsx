import { useEffect, useState } from 'react';
import { FormProvider, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import { yupResolver } from '@hookform/resolvers/yup';

import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import NavHeader from '@app/components/navigation/NavHeader';
import {
  Button,
  Modal,
  ModalContent,
  TableContainer
} from '@app/components/v2';
import { useWorkspace } from '@app/context';
import { usePopUp, useToggle } from '@app/hooks';
import {
  useCreateWsTag,
  useGetProjectSecrets,
  useGetUserWsEnvironments,
  useGetUserWsKey,
} from '@app/hooks/api';
import { WorkspaceEnv } from '@app/hooks/api/types';

import { CreateTagModal } from './components/CreateTagModal';
import { EnvComparisonHeader } from './components/EnvComparisonHeader';
import { EnvComparisonRow } from './components/EnvComparisonRow';
import {
  DEFAULT_SECRET_VALUE,
  FormData,
  schema
} from './DashboardPage.utils';

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
export const DashboardEnvOverview = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { createNotification } = useNotificationContext();

  const { popUp
    // , handlePopUpOpen
    , handlePopUpToggle, handlePopUpClose } = usePopUp([
    'secretDetails',
    'addTag',
    'secretSnapshots',
    'uploadedSecOpts',
    'compareSecrets'
  ] as const);
  const [isSecretValueHidden, setIsSecretValueHidden] = useToggle(true);
  const [snapshotId, setSnaphotId] = useState<string | null>(null);
  console.log(setIsSecretValueHidden, setSnaphotId)
  const [selectedEnv, setSelectedEnv] = useState<WorkspaceEnv | null>(null);
  // const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { currentWorkspace, isLoading } = useWorkspace();
  const workspaceId = currentWorkspace?._id as string;
  const { data: latestFileKey } = useGetUserWsKey(workspaceId);

  useEffect(() => {
    if (!isLoading && !workspaceId && router.isReady) {
      router.push('/noprojects');
    }
  }, [isLoading, workspaceId, router.isReady]);

  const { data: wsEnv, isLoading: isEnvListLoading } = useGetUserWsEnvironments({
    workspaceId,
    onSuccess: (data) => {
      // get an env with one of the access available
      const env = data.find(({ isReadDenied, isWriteDenied }) => !isWriteDenied || !isReadDenied);
      if (env) {
        setSelectedEnv(env);
      }
    }
  });
  
  const { data: secrets, isLoading: isSecretsLoading } = useGetProjectSecrets({
    workspaceId,
    env: wsEnv?.map(env => env.slug) ?? [],
    decryptFileKey: latestFileKey!,
    isPaused: Boolean(snapshotId)
  });

  console.log(333333, secrets, [... new Set(secrets?.secrets.map((secret: any) => secret.key))])

  // mutation calls
  // const { mutateAsync: batchSecretOp } = useBatchSecretsOp();
  // const { mutateAsync: performSecretRollback } = usePerformSecretRollback();
  // const { mutateAsync: registerUserAction } = useRegisterUserAction();
  const { mutateAsync: createWsTag } = useCreateWsTag();

  const method = useForm<FormData>({
    // why any: well yup inferred ts expects other keys to defined as undefined
    defaultValues: secrets as any,
    values: secrets as any,
    mode: 'onBlur',
    resolver: yupResolver(schema)
  });

  const {
    control,
    // handleSubmit,
    // getValues,
    // setValue,
    // formState: { isSubmitting, dirtyFields },
    // reset
  } = method;
  const formSecrets = useWatch({ control, name: 'secrets' });
  console.log(formSecrets)
  const { fields, prepend, 
    // append, remove, update 
  } = useFieldArray({ control, name: 'secrets' });
  console.log(987, fields, secrets?.secrets.map((secret: any) => secret.key))

  const isRollbackMode = Boolean(snapshotId);
  const isReadOnly = selectedEnv?.isWriteDenied;
  const isAddOnly = selectedEnv?.isReadDenied && !selectedEnv?.isWriteDenied;
  // const canDoRollback = !isReadOnly && !isAddOnly;


  // const onSortSecrets = () => {
  //   const dir = sortDir === 'asc' ? 'desc' : 'asc';
  //   const sec = getValues('secrets') || [];
  //   const sortedSec = sec.sort((a, b) =>
  //     dir === 'asc' ? a?.key?.localeCompare(b?.key || '') : b?.key?.localeCompare(a?.key || '')
  //   );
  //   setValue('secrets', sortedSec);
  //   setSortDir(dir);
  // };

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
      <div className="container mx-auto flex h-full w-full items-center justify-center px-8 text-mineshaft-50 dark:[color-scheme:dark]">
        <img src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
      </div>
    );
  }

  // when secrets is not loading and secrets list is empty
  const isDashboardSecretEmpty = !isSecretsLoading && !formSecrets?.length;
  const isSecretEmpty = (!isRollbackMode && isDashboardSecretEmpty);

  const userAvailableEnvs = wsEnv?.filter(
    ({ isReadDenied, isWriteDenied }) => !isReadDenied || !isWriteDenied
  );

  return (
    <div className="container mx-auto max-w-full px-6 text-mineshaft-50 dark:[color-scheme:dark]">
      <FormProvider {...method}>
        <form autoComplete="off">
          {/* breadcrumb row */}
          <div className="relative right-5">
            <NavHeader pageName={t('dashboard:title')} isProjectRelated />
          </div>
          <div className="mt-8 ml-1">
            <p className="text-3xl font-semibold text-bunker-100">Secrets Overview</p>
            <p className="text-md text-bunker-300">Put your secrets to work with the <span className="text-primary">Infisical CLI</span></p>
          </div>
          <div className={`${isSecretEmpty ? "" : ""} flex flex-row items-start justify-center mt-10 h-[calc(100vh-270px)] overflow-y-scroll overflow-x-hidden no-scrollbar no-scrollbar::-webkit-scrollbar`}>
            {!isSecretEmpty && (
              <TableContainer className='border-0'>
                <table className="secret-table relative bg-bunker-800">
                  <EnvComparisonHeader userAvailableEnvs={userAvailableEnvs} />
                  <tbody className="overflow-y-auto max-h-screen">
                    {[... new Set(secrets?.secrets.map((secret: any) => secret.key))].map((key, index) => (
                      <EnvComparisonRow
                        key={key}
                        secrets={secrets?.secrets.filter(secret => secret.key === key)}
                        isReadOnly={isReadOnly}
                        isAddOnly={isAddOnly}
                        index={index}
                        isSecretValueHidden={isSecretValueHidden}
                        userAvailableEnvs={userAvailableEnvs}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="group min-w-full flex flex-row items-center border-none mt-4">
                      <td className="w-10 h-10 px-4 flex items-center justify-center border-none"><div className='text-center w-10 text-xs text-transparent'>0</div></td>
                      <td className="border-none">
                        <div className="min-w-[220px] lg:min-w-[240px] xl:min-w-[280px] relative flex items-center justify-end w-full text-transparent">1</div>
                      </td>
                      {userAvailableEnvs?.map(env => {
                        return <>
                          <td className="w-10 px-4 flex items-center justify-center h-10 border-none">
                            <div className='text-center w-10 text-xs text-transparent'>{0}</div>
                          </td>
                          <td className="flex flex-row w-full justify-center h-10 items-center border-none">
                            <Button
                              onClick={() => prepend(DEFAULT_SECRET_VALUE, { shouldFocus: false })}
                              isDisabled={isReadOnly || isRollbackMode}
                              variant="outline_bg"
                              colorSchema="primary"
                              isFullWidth
                              className="h-10"
                            >
                              Explore {env.name}
                            </Button>
                          </td>
                        </>
                      })}
                    </tr>
                  </tfoot>
                </table>
              </TableContainer>
            )}
            {/* <div className="ml-10 h-full flex items-start justify-center">
              <Button
                leftIcon={<FontAwesomeIcon icon={faPlus}/>}
                onClick={() => prepend(DEFAULT_SECRET_VALUE, { shouldFocus: false })}
                isDisabled={isReadOnly || isRollbackMode}
                variant="outline_bg"
                colorSchema="primary"
                isFullWidth
                className="h-10"
              >
                Add Environment
              </Button>
            </div> */}
          </div>
        </form>
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
      </FormProvider>
    </div>
  );
};
