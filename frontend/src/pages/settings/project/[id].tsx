import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import Button from '@app/components/basic/buttons/Button';
import AddServiceTokenDialog from '@app/components/basic/dialog/AddServiceTokenDialog';
import InputField from '@app/components/basic/InputField';
import EnvironmentTable from '@app/components/basic/table/EnvironmentsTable';
import ServiceTokenTable from '@app/components/basic/table/ServiceTokenTable';
import NavHeader from '@app/components/navigation/NavHeader';
import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';
import deleteEnvironment from '@app/pages/api/environments/deleteEnvironment';
import updateEnvironment from '@app/pages/api/environments/updateEnvironment';
import { faCheck, faCopy, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import createEnvironment from '../../api/environments/createEnvironment';
import getServiceTokens from '../../api/serviceToken/getServiceTokens';
import deleteWorkspace from '../../api/workspace/deleteWorkspace';
import getWorkspaces from '../../api/workspace/getWorkspaces';
import renameWorkspace from '../../api/workspace/renameWorkspace';

type EnvData = {
  name: string;
  slug: string;
};

export default function SettingsBasic() {
  const [buttonReady, setButtonReady] = useState(false);
  const router = useRouter();
  const [workspaceName, setWorkspaceName] = useState('');
  const [serviceTokens, setServiceTokens] = useState<any[]>([]);
  const [environments, setEnvironments] = useState<Array<EnvData>>([]);
  const [workspaceToBeDeletedName, setWorkspaceToBeDeletedName] = useState('');
  // const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddServiceTokenDialogOpen, setIsAddServiceTokenDialogOpen] = useState(false);
  const [projectIdCopied, setProjectIdCopied] = useState(false);
  const workspaceId = router.query.id as string;

  const { t } = useTranslation();

  /**
   * This function copies the project id to the clipboard
   */
  function copyToClipboard() {
    const copyText = document.getElementById('myInput') as HTMLInputElement;

    if (copyText) {
      copyText.select();
      copyText.setSelectionRange(0, 99999); // For mobile devices

      navigator.clipboard.writeText(copyText.value);

      setProjectIdCopied(true);
      setTimeout(() => setProjectIdCopied(false), 2000);
    }
  }

  useEffect(() => {
    const load = async () => {
      const userWorkspaces = await getWorkspaces();
      userWorkspaces.forEach((userWorkspace) => {
        if (userWorkspace._id === workspaceId) {
          setWorkspaceName(userWorkspace.name);
          setEnvironments(userWorkspace.environments);
        }
      });
      const tempServiceTokens = await getServiceTokens({
        workspaceId
      });
      setServiceTokens(tempServiceTokens);
    };

    load();
  }, []);

  const modifyWorkspaceName = (newName: string) => {
    setButtonReady(true);
    setWorkspaceName(newName);
  };

  const submitChanges = (newWorkspaceName: string) => {
    renameWorkspace(workspaceId, newWorkspaceName);
    setButtonReady(false);
  };

  const closeAddServiceTokenModal = () => {
    setIsAddServiceTokenDialogOpen(false);
  };

  /**
   * This function deleted a workspace.
   * It first checks if there is more than one workspace aviable. Otherwise, it doesn't delete
   * It then checks if the name of the workspace to be deleted is correct. Otherwise, it doesn't delete.
   * It then deletes the workspace and forwards the user to another aviable workspace.
   */
  const executeDeletingWorkspace = async () => {
    const userWorkspaces = await getWorkspaces();

    if (userWorkspaces.length > 1) {
      if (
        userWorkspaces.filter((workspace) => workspace._id === workspaceId)[0].name ===
        workspaceToBeDeletedName
      ) {
        await deleteWorkspace(workspaceId);
        const ws = await getWorkspaces();
        router.push(`/dashboard/${ws[0]._id}`);
      }
    }
  };

  const onCreateEnvironment = async ({ name, slug }: EnvData) => {
    const res = await createEnvironment(workspaceId, {
      environmentName: name,
      environmentSlug: slug
    });
    if (res) {
      // TODO: on react-query migration do an api call to resync
      setEnvironments((env) => [...env, { name, slug }]);
    }
  };

  const onUpdateEnvironment = async (oldSlug: string, { name, slug }: EnvData) => {
    const res = await updateEnvironment(workspaceId, {
      oldEnvironmentSlug: oldSlug,
      environmentName: name,
      environmentSlug: slug
    });
    // TODO: on react-query migration do an api call to resync
    if (res) {
      setEnvironments((env) => env.map((el) => (el.slug === oldSlug ? { name, slug } : el)));
    }
  };

  const onDeleteEnvironment = async (slugToBeDelete: string) => {
    const res = await deleteEnvironment(workspaceId, slugToBeDelete);
    // TODO: on react-query migration do an api call to resync
    if (res) {
      setEnvironments((env) => env.filter(({ slug }) => slug !== slugToBeDelete));
    }
  };

  return (
    <div className="bg-bunker-800 max-h-screen flex flex-col justify-between text-white">
      <Head>
        <title>{t('common:head-title', { title: t('settings-project:title') })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <AddServiceTokenDialog
        isOpen={isAddServiceTokenDialogOpen}
        workspaceId={workspaceId}
        environments={environments}
        closeModal={closeAddServiceTokenModal}
        workspaceName={workspaceName}
        serviceTokens={serviceTokens}
        setServiceTokens={setServiceTokens}
      />
      <div className="flex flex-row mr-6 max-w-5xl">
        <div className="w-full max-h-screen pb-2 overflow-y-auto">
          <NavHeader pageName={t('settings-project:title')} isProjectRelated />
          <div className="flex flex-row justify-between items-center ml-6 my-8 text-xl max-w-5xl">
            <div className="flex flex-col justify-start items-start text-3xl">
              <p className="font-semibold mr-4 text-gray-200">{t('settings-project:title')}</p>
              <p className="font-normal mr-4 text-gray-400 text-base">
                {t('settings-project:description')}
              </p>
            </div>
          </div>
          <div className="flex flex-col ml-6 text-mineshaft-50">
            <div className="flex flex-col">
              <div className="min-w-md mt-2 flex flex-col items-start">
                <div className="bg-white/5 rounded-md px-6 pb-4 flex flex-col items-start w-full mb-6 pt-2">
                  <p className="text-xl font-semibold mb-4 mt-2">{t('common:display-name')}</p>
                  <div className="max-h-28 w-full max-w-md mr-auto">
                    <InputField
                      label=""
                      onChangeHandler={modifyWorkspaceName}
                      type="varName"
                      value={workspaceName}
                      placeholder=""
                      isRequired
                    />
                  </div>
                  <div className="flex justify-start w-full">
                    <div className="flex justify-start max-w-sm mt-4 mb-2">
                      <Button
                        text={t('common:save-changes') as string}
                        onButtonPressed={() => submitChanges(workspaceName)}
                        color="mineshaft"
                        size="md"
                        active={buttonReady}
                        iconDisabled={faCheck}
                        textDisabled="Saved"
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-white/5 rounded-md px-6 pt-4 pb-2 flex flex-col items-start w-full mb-6 mt-4">
                  <p className="text-xl font-semibold self-start">{t('common:project-id')}</p>
                  <p className="text-base text-gray-400 font-normal self-start mt-4">
                    {t('settings-project:project-id-description')}
                  </p>
                  <p className="text-base text-gray-400 font-normal self-start">
                    {t('settings-project:project-id-description2')}
                    {/* eslint-disable-next-line react/jsx-no-target-blank */}
                    <a
                      href="https://infisical.com/docs/getting-started/introduction"
                      target="_blank"
                      rel="noopener"
                      className="text-primary hover:opacity-80 duration-200"
                    >
                      {t('settings-project:docs')}
                    </a>
                  </p>
                  <p className="mt-4 text-xs text-bunker-300">
                    {t('settings-project:auto-generated')}
                  </p>
                  <div className="flex justify-end items-center bg-white/[0.07] text-base mt-2 mb-3 mr-2 rounded-md text-gray-400">
                    <p className="mr-2 font-bold pl-4">{`${t('common:project-id')}:`}</p>
                    <input
                      type="text"
                      value={workspaceId}
                      id="myInput"
                      className="bg-white/0 text-gray-400 py-2 w-60 px-2 min-w-md outline-none"
                      disabled
                    />
                    <div className="group font-normal group relative inline-block text-gray-400 underline hover:text-primary duration-200">
                      <button
                        type="button"
                        onClick={copyToClipboard}
                        className="pl-4 pr-4 border-l border-white/20 py-2 hover:bg-white/[0.12] duration-200"
                      >
                        {projectIdCopied ? (
                          <FontAwesomeIcon icon={faCheck} className="pr-0.5" />
                        ) : (
                          <FontAwesomeIcon icon={faCopy} />
                        )}
                      </button>
                      <span className="absolute hidden group-hover:flex group-hover:animate-popup duration-300 w-28 -left-8 -top-20 translate-y-full pl-3 py-2 bg-bunker-800 rounded-md text-center text-gray-400 text-sm">
                        {t('common:click-to-copy')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="bg-white/5 rounded-md px-6 pt-6 flex flex-col items-start w-full mt-4 mb-4">
                  <EnvironmentTable
                    data={environments}
                    onCreateEnv={onCreateEnvironment}
                    onUpdateEnv={onUpdateEnvironment}
                    onDeleteEnv={onDeleteEnvironment}
                  />
                </div>
                <div className="bg-white/5 rounded-md px-6 flex flex-col items-start w-full mt-4 mb-4 pt-2">
                  <div className="flex flex-row justify-between w-full">
                    <div className="flex flex-col w-full">
                      <p className="text-xl font-semibold mb-3">
                        {t('section-token:service-tokens')}
                      </p>
                      <p className="text-sm text-gray-400">
                        {t('section-token:service-tokens-description')}
                      </p>
                      <p className="text-sm text-gray-400 mb-4">
                        Please, make sure you are on the
                        <a
                          className="text-primary underline underline-offset-2 ml-1"
                          href="https://infisical.com/docs/cli/overview"
                          target="_blank"
                          rel="noreferrer"
                        >
                          latest version of CLI
                        </a>
                        .
                      </p>
                    </div>
                    <div className="w-48 mt-2">
                      <Button
                        text={t('section-token:add-new') as string}
                        onButtonPressed={() => {
                          setIsAddServiceTokenDialogOpen(true);
                        }}
                        color="mineshaft"
                        icon={faPlus}
                        size="md"
                      />
                    </div>
                  </div>
                  <ServiceTokenTable
                    data={serviceTokens}
                    workspaceName={workspaceName}
                    setServiceTokens={setServiceTokens as any}
                  />
                </div>
              </div>
            </div>
            <div className="bg-white/5 rounded-md px-6 border-l border-red pl-6 flex flex-col items-start w-full mb-6 mt-4 pb-4 pt-2">
              <p className="text-xl font-bold text-red">{t('settings-project:danger-zone')}</p>
              <p className="mt-2 text-md text-gray-400">{t('settings-project:danger-zone-note')}</p>
              <div className="max-h-28 w-full max-w-md mr-auto mt-4">
                <InputField
                  label={t('settings-project:project-to-delete') as string}
                  onChangeHandler={setWorkspaceToBeDeletedName}
                  type="varName"
                  value={workspaceToBeDeletedName}
                  placeholder=""
                  isRequired
                />
              </div>
              <button
                type="button"
                className="max-w-md mt-6 w-full inline-flex justify-center rounded-md border border-transparent bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-400 hover:bg-red hover:text-white hover:font-semibold hover:text-semibold duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                onClick={executeDeletingWorkspace}
              >
                {t('settings-project:delete-project')}
              </button>
              <p className="mt-0.5 ml-1 text-xs text-gray-500">
                {t('settings-project:delete-project-note')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

SettingsBasic.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps([
  'settings',
  'settings-project',
  'section-token'
]);
