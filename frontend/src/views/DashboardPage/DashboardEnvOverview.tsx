import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import { faFolderOpen, faKey, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import NavHeader from '@app/components/navigation/NavHeader';
import { Button, Input, TableContainer, Tooltip } from '@app/components/v2';
import { useWorkspace } from '@app/context';
import {
  useGetProjectFoldersBatch,
  useGetProjectSecretsByKey,
  useGetUserWsEnvironments,
  useGetUserWsKey
} from '@app/hooks/api';

import { EnvComparisonRow } from './components/EnvComparisonRow';
import { FolderComparisonRow } from './components/EnvComparisonRow/FolderComparisonRow';

export const DashboardEnvOverview = () => {
  const { t } = useTranslation();
  const router = useRouter();

  const { currentWorkspace, isLoading } = useWorkspace();
  const workspaceId = currentWorkspace?._id as string;
  const { data: latestFileKey } = useGetUserWsKey(workspaceId);

  const [searchFilter, setSearchFilter] = useState('');
  const secretPath = router.query?.secretPath as string;

  useEffect(() => {
    if (!isLoading && !workspaceId && router.isReady) {
      router.push('/noprojects');
    }
  }, [isLoading, workspaceId, router.isReady]);

  const { data: wsEnv, isLoading: isEnvListLoading } = useGetUserWsEnvironments({
    workspaceId
  });

  const userAvailableEnvs = wsEnv?.filter(({ isReadDenied }) => !isReadDenied);

  const { data: secrets, isLoading: isSecretsLoading } = useGetProjectSecretsByKey({
    workspaceId,
    env: userAvailableEnvs?.map((env) => env.slug) ?? [],
    decryptFileKey: latestFileKey!,
    isPaused: false,
    secretPath
  });

  const folders = useGetProjectFoldersBatch({
    folders:
      userAvailableEnvs?.map((env) => ({
        environment: env.slug,
        workspaceId
      })) ?? [],
    parentFolderPath: secretPath
  });

  const foldersGroupedByEnv = useMemo(() => {
    const res: Record<string, Record<string, boolean>> = {};
    folders.forEach(({ data }) => {
      data?.folders
        ?.filter(({ name }) => name.toLowerCase().includes(searchFilter))
        ?.forEach((folder) => {
          if (!res?.[folder.name]) res[folder.name] = {};
          res[folder.name][data.environment] = true;
        });
    });
    return res;
  }, [folders, userAvailableEnvs, searchFilter]);

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

  const onExploreEnv = (slug: string) => {
    const query: Record<string, string> = { ...router.query, env: slug };
    delete query.secretPath;
    // the dir return will have the present directory folder id
    // use that when clicking on explore to redirect user to there
    const envFolder = folders.find(({ data }) => slug === data?.environment);
    const dir = envFolder?.data?.dir?.pop();
    if (dir) {
      query.folderId = dir.id;
    }

    router.push({
      pathname: router.pathname,
      query
    });
  };

  const onFolderClick = (path: string) => {
    router.push({
      pathname: router.pathname,
      query: {
        ...router.query,
        secretPath: `${router.query?.secretPath || ''}/${path}`
      }
    });
  };

  const onFolderCrumbClick = (index: number) => {
    const newSecPath = secretPath.split('/').filter(Boolean).slice(0, index).join('/');
    const query = { ...router.query, secretPath: `/${newSecPath}` } as Record<string, string>;
    // root condition
    if (index === 0) delete query.secretPath;
    router.push({
      pathname: router.pathname,
      query
    });
  };

  if (isSecretsLoading || isEnvListLoading) {
    return (
      <div className="container mx-auto flex h-screen w-full items-center justify-center px-8 text-mineshaft-50 dark:[color-scheme:dark]">
        <img src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
      </div>
    );
  }

  const filteredSecrets = Object.keys(secrets?.secrets || {})?.filter((secret: any) =>
    secret.toUpperCase().includes(searchFilter.toUpperCase())
  );
  // when secrets is not loading and secrets list is empty
  const isDashboardSecretEmpty = !isSecretsLoading && !filteredSecrets?.length;
  const isFoldersEmtpy =
    !folders.some(({ isLoading: isFolderLoading }) => isFolderLoading) &&
    !Object.keys(foldersGroupedByEnv).length;
  const isDashboardEmpty = isFoldersEmtpy && isDashboardSecretEmpty;

  return (
    <div className="container mx-auto max-w-full px-6 text-mineshaft-50 dark:[color-scheme:dark]">
      <div className="relative right-5">
        <NavHeader pageName={t('dashboard.title')} isProjectRelated />
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
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div
            className="breadcrumb relative z-20 border-solid border-mineshaft-600 bg-mineshaft-800 py-1 px-5"
            onClick={() => onFolderCrumbClick(0)}
            onKeyDown={() => null}
            role="button"
            tabIndex={0}
          >
            <FontAwesomeIcon icon={faFolderOpen} className="text-primary" />
          </div>
          {(secretPath || '')
            .split('/')
            .filter(Boolean)
            .map((path, index, arr) => (
              <div
                key={`secret-path-${index + 1}`}
                className={`breadcrumb relative z-20 ${
                  index + 1 === arr.length ? 'cursor-default' : 'cursor-pointer'
                } border-solid border-mineshaft-600 py-1 px-5`}
                onClick={() => onFolderCrumbClick(index + 1)}
                onKeyDown={() => null}
                role="button"
                tabIndex={0}
              >
                {path}
              </div>
            ))}
        </div>
        <div className="w-80">
          <Input
            className="h-[2.3rem] bg-mineshaft-800 placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
            placeholder="Search by secret/folder name..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          />
        </div>
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
            isDashboardEmpty ? '' : ''
          } no-scrollbar::-webkit-scrollbar mt-3 flex h-full max-h-[calc(100vh-370px)] w-full min-w-[60.3rem] flex-grow flex-row items-start justify-center overflow-x-hidden rounded-md border border-mineshaft-600 no-scrollbar`}
        >
          {!isDashboardEmpty && (
            <TableContainer className="border-none">
              <table className="secret-table relative w-full bg-mineshaft-900">
                <tbody className="max-h-screen overflow-y-auto">
                  {Object.keys(foldersGroupedByEnv || {}).map((folderName, index) => (
                    <FolderComparisonRow
                      key={`${folderName}-${index + 1}`}
                      folderName={folderName}
                      userAvailableEnvs={userAvailableEnvs}
                      folderInEnv={foldersGroupedByEnv[folderName]}
                      onClick={onFolderClick}
                    />
                  ))}
                  {Object.keys(secrets?.secrets || {})
                    ?.filter((secret: any) =>
                      secret.toUpperCase().includes(searchFilter.toUpperCase())
                    )
                    .map((key) => (
                      <EnvComparisonRow
                        key={`row-${key}`}
                        secrets={secrets?.secrets?.[key]}
                        isReadOnly
                        isSecretValueHidden
                        userAvailableEnvs={userAvailableEnvs}
                      />
                    ))}
                </tbody>
              </table>
            </TableContainer>
          )}
          {isDashboardEmpty && (
            <div className="flex h-40 w-full flex-row rounded-md">
              <div className="flex w-full min-w-[11rem] flex-col items-center justify-center rounded-md border-none bg-mineshaft-800 text-bunker-300">
                <FontAwesomeIcon icon={faKey} className="mb-4 text-4xl" />
                <span className="mb-1">No secrets/folders found.</span>
                <span>To add more secrets you can explore any environment.</span>
              </div>
            </div>
          )}
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
                  onClick={() => onExploreEnv(env.slug)}
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
    </div>
  );
};
