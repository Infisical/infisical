import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import { yupResolver } from '@hookform/resolvers/yup';

import NavHeader from '@app/components/navigation/NavHeader';
import { Button, TableContainer, Tooltip } from '@app/components/v2';
import { useWorkspace } from '@app/context';
import {
  useGetProjectSecretsByKey,
  useGetUserWsEnvironments,
  useGetUserWsKey
} from '@app/hooks/api';
import { WorkspaceEnv } from '@app/hooks/api/types';

import { EnvComparisonRow } from './components/EnvComparisonRow';
import { FormData, schema } from './DashboardPage.utils';

export const DashboardEnvOverview = ({ onEnvChange }: { onEnvChange: any }) => {
  const { t } = useTranslation();
  const router = useRouter();

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

  const userAvailableEnvs = wsEnv?.filter(({ isReadDenied }) => !isReadDenied);

  const { data: secrets, isLoading: isSecretsLoading } = useGetProjectSecretsByKey({
    workspaceId,
    env: userAvailableEnvs?.map((env) => env.slug) ?? [],
    decryptFileKey: latestFileKey!,
    isPaused: false
  });

  const method = useForm<FormData>({
    // why any: well yup inferred ts expects other keys to defined as undefined
    defaultValues: secrets as any,
    values: secrets as any,
    mode: 'onBlur',
    resolver: yupResolver(schema)
  });

  const numSecretsMissingPerEnv = useMemo(() => {
    // first get all sec in the env then subtract with total to get missing ones
    const secPerEnvMissing: Record<string, number> = Object.fromEntries(
      (userAvailableEnvs || [])?.map(({ slug }) => [slug, 0])
    );
    Object.keys(secrets?.secrets || {}).forEach((key) =>
      secrets?.secrets?.[key].forEach((val) => {
        secPerEnvMissing[val.env] += 1;
      })
    );
    Object.keys(secPerEnvMissing).forEach((k) => {
      secPerEnvMissing[k] = (secrets?.uniqueSecCount || 0) - secPerEnvMissing[k];
    });
    return secPerEnvMissing;
  }, [secrets, userAvailableEnvs]);

  const isReadOnly = selectedEnv?.isWriteDenied;

  if (isSecretsLoading || isEnvListLoading) {
    return (
      <div className="container mx-auto flex h-screen w-full items-center justify-center px-8 text-mineshaft-50 dark:[color-scheme:dark]">
        <img src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
      </div>
    );
  }

  // when secrets is not loading and secrets list is empty
  const isDashboardSecretEmpty = !isSecretsLoading && !Object.keys(secrets?.secrets || {})?.length;

  return (
    <div className="container mx-auto max-w-full px-6 text-mineshaft-50 dark:[color-scheme:dark]">
      <FormProvider {...method}>
        <form autoComplete="off">
          {/* breadcrumb row */}
          <div className="relative right-6">
            <NavHeader pageName={t('dashboard:title')} isProjectRelated />
          </div>
          <div className="mt-6">
            <p className="text-3xl font-semibold text-bunker-100">Secrets Overview</p>
            <p className="text-md text-bunker-300">
              Inject your secrets using
              <a
                className="mx-1 text-primary/80 hover:text-primary"
                href="https://infisical.com/docs/cli/overview"
                target="_blank"
                rel="noopener noreferrer"
              >
                Infisical CLI
              </a>
              or
              <a
                className="mx-1 text-primary/80 hover:text-primary"
                href="https://infisical.com/docs/sdks/overview"
                target="_blank"
                rel="noopener noreferrer"
              >
                Infisical SDKs
              </a>
            </p>
          </div>
          <div className="overflow-y-auto">
            <div className="sticky top-0 mt-8 flex h-10 min-w-[60.3rem] flex-row rounded-md border border-mineshaft-600 bg-mineshaft-800">
              <div className="sticky top-0 flex w-10 items-center justify-center border-none px-4">
                <div className="w-10 text-center text-xs text-transparent">{0}</div>
              </div>
              <div className="sticky top-0 border-none">
                <div className="relative flex h-full w-full min-w-[200px] items-center justify-start lg:min-w-[220px] xl:min-w-[250px]">
                  <div className="text-sm font-medium ">Secret</div>
                </div>
              </div>
              {numSecretsMissingPerEnv &&
                userAvailableEnvs?.map((env) => {
                  return (
                    <div
                      key={`header-${env.slug}`}
                      className="flex w-full min-w-[11rem] flex-row items-center rounded-md border-none bg-mineshaft-800"
                    >
                      <div className="flex w-full flex-row justify-center text-center text-sm font-medium text-bunker-200/[.99]">
                        {env.name}
                        {numSecretsMissingPerEnv[env.slug] > 0 && (
                          <div className="mt-0.5 ml-2.5 flex h-[1.1rem] w-[1.1rem] cursor-default items-center justify-center rounded-sm border border-red-400 bg-red text-xs text-bunker-100">
                            <Tooltip
                              content={`${
                                numSecretsMissingPerEnv[env.slug]
                              } secrets missing compared to other environments`}
                            >
                              <span className="text-bunker-100">
                                {numSecretsMissingPerEnv[env.slug]}
                              </span>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
            <div
              className={`${
                isDashboardSecretEmpty ? '' : ''
              } no-scrollbar::-webkit-scrollbar mt-3 border rounded-md border-mineshaft-600 flex h-full max-h-[calc(100vh-370px)] w-full min-w-[60.3rem] flex-grow flex-row items-start justify-center overflow-x-hidden no-scrollbar`}
            >
              {!isDashboardSecretEmpty && (
                <TableContainer className="border-none">
                  <table className="secret-table relative w-full bg-mineshaft-900">
                    <tbody className="max-h-screen overflow-y-auto">
                      {Object.keys(secrets?.secrets || {}).map((key, index) => (
                        <EnvComparisonRow
                          key={`row-${key}`}
                          secrets={secrets?.secrets?.[key]}
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
              {isDashboardSecretEmpty && (
                <div className="flex h-40 w-full flex-row rounded-md">
                  <div className="flex w-full min-w-[11rem] flex-col items-center justify-center rounded-md border-none bg-mineshaft-800 text-bunker-300">
                    <span className="mb-1">No secrets are available in this project yet.</span>
                    <span>You can go into any environment to add secrets there.</span>
                  </div>
                </div>
              )}
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
            <div className="group mt-4 flex min-w-[60.3rem] flex-row items-center">
              <div className="flex h-10 w-10 items-center justify-center border-none px-4">
                <div className="w-10 text-center text-xs text-transparent">0</div>
              </div>
              <div className="flex min-w-[200px] flex-row items-center justify-between lg:min-w-[220px] xl:min-w-[250px]">
                <span className="text-transparent">0</span>
                <button type="button" className="mr-2 text-transparent">
                  1
                </button>
              </div>
              {userAvailableEnvs?.map((env) => {
                return (
                  <div
                    key={`button-${env.slug}`}
                    className="mx-2 mb-1 flex h-10 w-full min-w-[11rem] flex-row items-center justify-center border-none"
                  >
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
                );
              })}
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
};
