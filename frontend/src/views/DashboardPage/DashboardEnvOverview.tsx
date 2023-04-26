import { useEffect, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import { yupResolver } from '@hookform/resolvers/yup';

import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import NavHeader from '@app/components/navigation/NavHeader';
import {
  Button,
  Modal,
  ModalContent,
  TableContainer,
  Tooltip
} from '@app/components/v2';
import { useWorkspace } from '@app/context';
import { usePopUp } from '@app/hooks';
import {
  useCreateWsTag,
  useGetProjectSecrets,
  useGetUserWsEnvironments,
  useGetUserWsKey,
} from '@app/hooks/api';
import { WorkspaceEnv } from '@app/hooks/api/types';

import { CreateTagModal } from './components/CreateTagModal';
import { EnvComparisonRow } from './components/EnvComparisonRow';
import {
  FormData,
  schema
} from './DashboardPage.utils';


export const DashboardEnvOverview = ({onEnvChange}: {onEnvChange: any;}) => {
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
  const [selectedEnv, setSelectedEnv] = useState<WorkspaceEnv | null>(null);

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
      const env = data.find(({ isReadDenied }) => !isReadDenied);
      if (env) {
        setSelectedEnv(env);
      }
    }
  });

  const userAvailableEnvs = wsEnv?.filter(
    ({ isReadDenied }) => !isReadDenied
  );
  
  const { data: secrets, isLoading: isSecretsLoading } = useGetProjectSecrets({
    workspaceId,
    env: userAvailableEnvs?.map(env => env.slug) ?? [],
    decryptFileKey: latestFileKey!,
    isPaused: false
  });

  // mutation calls
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

  const isReadOnly = selectedEnv?.isWriteDenied;

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
      <div className="container mx-auto flex h-screen w-full items-center justify-center px-8 text-mineshaft-50 dark:[color-scheme:dark]">
        <img src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
      </div>
    );
  }

  // when secrets is not loading and secrets list is empty
  const isDashboardSecretEmpty = !isSecretsLoading && !formSecrets?.length;

  const numSecretsMissingPerEnv = userAvailableEnvs?.map(envir => ({[envir.slug]: [... new Set(secrets?.secrets.map((secret: any) => secret.key))].length - [... new Set(secrets?.secrets.filter(s => s.env === envir.slug).map((secret: any) => secret.key))].length})).reduce((acc, cur) => ({ ...acc, ...cur }), {})

  return (
    <div className="container mx-auto max-w-full px-6 text-mineshaft-50 dark:[color-scheme:dark]">
      <FormProvider {...method}>
        <form autoComplete="off">
          {/* breadcrumb row */}
          <div className="relative right-5">
            <NavHeader pageName={t('dashboard:title')} isProjectRelated />
          </div>
          <div className="mt-6 ml-1">
            <p className="text-3xl font-semibold text-bunker-100">Secrets Overview</p>
            <p className="text-md text-bunker-300">Inject your secrets using 
              <a 
                className="text-primary/80 hover:text-primary mx-1" 
                href="https://infisical.com/docs/cli/overview" 
                target="_blank"
                rel="noopener noreferrer"
              >
                Infisical CLI
              </a> 
              or 
              <a 
                className="text-primary/80 hover:text-primary mx-1" 
                href="https://infisical.com/docs/sdks/overview" 
                target="_blank"
                rel="noopener noreferrer"
              >
                Infisical SDKs
              </a> </p>
          </div>
          <div className="overflow-y-auto">
            <div className="sticky top-0 absolute flex flex-row h-10 bg-mineshaft-800 border border-mineshaft-600 rounded-md mt-8 min-w-[60.3rem]">
              <div className="sticky top-0 w-10 px-4 flex items-center justify-center border-none">
                <div className='text-center w-10 text-xs text-transparent'>{0}</div>
              </div>
              <div className="sticky top-0 border-none">
                <div className="min-w-[200px] lg:min-w-[220px] xl:min-w-[250px] relative flex items-center justify-start h-full w-full">
                  <div className="text-sm font-medium ">Secret</div>
                </div>
              </div>
              {numSecretsMissingPerEnv && userAvailableEnvs?.map(env => {
                return <div key={`header-${env.slug}`} className="flex flex-row w-full bg-mineshaft-800 rounded-md items-center border-none min-w-[11rem]">
                  <div className="text-sm font-medium w-full text-center text-bunker-200/[.99] flex flex-row justify-center">
                    {env.name}
                    {numSecretsMissingPerEnv[env.slug] > 0 && <div className="bg-red rounded-sm h-[1.1rem] w-[1.1rem] mt-0.5 text-bunker-100 ml-2.5 text-xs border border-red-400 flex items-center justify-center cursor-default">
                      <Tooltip content={`${numSecretsMissingPerEnv[env.slug]} secrets missing compared to other environments`}><span className="text-bunker-100">{numSecretsMissingPerEnv[env.slug]}</span></Tooltip>
                    </div>}
                  </div>
                </div>
              })}
            </div>
            <div className={`${isDashboardSecretEmpty ? "" : ""} flex flex-row items-start justify-center mt-3 h-full max-h-[calc(100vh-370px)] min-w-[60.3rem] flex-grow w-full overflow-x-hidden no-scrollbar no-scrollbar::-webkit-scrollbar`}>
              {!isDashboardSecretEmpty && (
                <TableContainer className='border-none'>
                  <table className="relative secret-table w-full relative bg-bunker-800">
                    <tbody className="overflow-y-auto max-h-screen">
                      {[... new Set(secrets?.secrets.map((secret: any) => secret.key))].map((key, index) => (
                        <EnvComparisonRow
                          key={`row-${key}`}
                          secrets={secrets?.secrets.filter(secret => secret.key === key)}
                          isReadOnly={isReadOnly}
                          index={index}
                          isSecretValueHidden
                          userAvailableEnvs={userAvailableEnvs}
                        />
                      ))}
                    </tbody>
                  </table>
                </TableContainer>
              )}
              {isDashboardSecretEmpty &&
                <div className='flex flex-row h-40 rounded-md mt-1 w-full'>
                  <div className="sticky top-0 w-10 px-4 flex items-center justify-center border-none">
                    <div className='text-center w-10 text-xs text-transparent'>{0}</div>
                  </div>
                  <div className="sticky top-0 border-none">
                    <div className="min-w-[200px] lg:min-w-[220px] xl:min-w-[250px] relative flex items-center justify-start h-full w-full">
                      <div className="text-sm font-medium text-transparent">Secret</div>
                    </div>
                  </div>
                  <div className="flex flex-col w-full bg-mineshaft-800 text-bunker-300 rounded-md items-center justify-center border-none mx-2 min-w-[11rem]">
                    <span className="mb-1">No secrets are available in this project yet.</span>
                    <span>You can go into any environment to add secrets there.</span>
                  </div>
                </div>}
                {/* In future, we should add an option to add environments here
                <div className="ml-10 h-full flex items-start justify-center">
                  <Button
                    leftIcon={<FontAwesomeIcon icon={faPlus}/>}
                    onClick={() => prepend(DEFAULT_SECRET_VALUE, { shouldFocus: false })}
                    variant="outline_bg"
                    colorSchema="primary"
                    isFullWidth
                    className="h-10"
                  >
                    Add Environment
                  </Button>
                </div> */}
            </div>
            <div className="group min-w-full flex flex-row items-center mt-4">
              <div className="w-10 h-10 px-4 flex items-center justify-center border-none"><div className='text-center w-10 text-xs text-transparent'>0</div></div>
              <div className="flex flex-row justify-between items-center min-w-[200px] lg:min-w-[220px] xl:min-w-[250px]">
                <span className="text-transparent">0</span>
                <button type="button" className='mr-2 text-transparent'>1</button>
              </div>
              {userAvailableEnvs?.map(env => {
                return <div key={`button-${env.slug}`} className="flex flex-row w-full justify-center h-10 items-center border-none mb-1 mx-2 min-w-[10rem]">
                    <Button
                      onClick={() => onEnvChange(env.slug)}
                      // router.push(`${router.asPath  }?env=${env.slug}`)
                      variant="outline_bg"
                      colorSchema="primary"
                      isFullWidth
                      className="h-10"
                    >
                      Explore {env.name}
                    </Button>
                  </div>
              })}
            </div>  
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
