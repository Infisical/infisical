import crypto from 'crypto';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';

import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import NavHeader from '@app/components/navigation/NavHeader';
// TODO(akhilmhdh):Refactor this into a better utility module package
import {
  decryptAssymmetric,
  encryptSymmetric
} from '@app/components/utilities/cryptography/crypto';
import { Button, FormControl, Input } from '@app/components/v2';
import { plans } from '@app/const';
import { useSubscription, useWorkspace } from '@app/context';
import { useToggle } from '@app/hooks';
import {
  useCreateServiceToken,
  useCreateWsEnvironment,
  useDeleteServiceToken,
  useDeleteWorkspace,
  useDeleteWsEnvironment,
  useGetUserWsKey,
  useGetUserWsServiceTokens,
  useRenameWorkspace,
  useUpdateWsEnvironment
} from '@app/hooks/api';

import {
  CopyProjectIDSection,
  CreateServiceToken,
  CreateUpdateEnvFormData,
  EnvironmentSection,
  ProjectNameChangeSection,
  ServiceTokenSection
} from './components';

export const ProjectSettingsPage = () => {
  const { t } = useTranslation();
  const { currentWorkspace, workspaces } = useWorkspace();
  const router = useRouter();
  const { data: serviceTokens } = useGetUserWsServiceTokens({
    workspaceID: currentWorkspace?._id || ''
  });
  const workspaceID = currentWorkspace?._id || '';
  const { createNotification } = useNotificationContext();
  // delete action worksapce
  const [deleteProjectInput, setDeleteProjectInput] = useState('');
  const [isDeleting, setIsDeleting] = useToggle();

  const renameWorkspace = useRenameWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  // env crud operation
  const createWsEnv = useCreateWsEnvironment();
  const updateWsEnv = useUpdateWsEnvironment();
  const deleteWsEnv = useDeleteWsEnvironment();

  // service token
  const { data: latestFileKey } = useGetUserWsKey(workspaceID);
  const createServiceToken = useCreateServiceToken();
  const deleteServiceToken = useDeleteServiceToken();

  // get user subscription
  const { subscriptionPlan } = useSubscription();
  const host = window.location.origin;
  const isEnvServiceAllowed =
    subscriptionPlan !== plans.starter || host !== 'https://app.infisical.com';

  const onRenameWorkspace = async (name: string) => {
    try {
      await renameWorkspace.mutateAsync({ workspaceID, newWorkspaceName: name });
      createNotification({
        text: 'Successfully renamed workspace',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to rename workspace',
        type: 'error'
      });
    }
  };

  const onDeleteWorkspace = async () => {
    setIsDeleting.on();
    try {
      await deleteWorkspace.mutateAsync({ workspaceID });
      // redirect user to first workspace user is part of
      const ws = workspaces.find(({ _id }) => _id !== workspaceID);
      router.push(`/dashboard/${ws?._id}`);
      createNotification({
        text: 'Successfully deleted workspace',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to delete workspace',
        type: 'error'
      });
    } finally {
      setIsDeleting.off();
    }
  };

  // workspace environment operation
  const onCreateWsEnv = async ({ environmentName, environmentSlug }: CreateUpdateEnvFormData) => {
    try {
      await createWsEnv.mutateAsync({ workspaceID, environmentName, environmentSlug });
      createNotification({
        text: 'Successfully created environment',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to create environment',
        type: 'error'
      });
    }
  };

  const onUpdateWsEnv = async (
    oldEnvironmentSlug: string,
    { environmentName, environmentSlug }: CreateUpdateEnvFormData
  ) => {
    try {
      await updateWsEnv.mutateAsync({
        workspaceID,
        environmentName,
        environmentSlug,
        oldEnvironmentSlug
      });
      createNotification({
        text: 'Successfully updated environment',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to update environment',
        type: 'error'
      });
    }
  };

  const onDeleteWsEnv = async (environmentSlug: string) => {
    try {
      await deleteWsEnv.mutateAsync({
        workspaceID,
        environmentSlug
      });
      createNotification({
        text: 'Successfully deleted environment',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to delete environment',
        type: 'error'
      });
    }
  };

  const onCreateServiceToken = async ({ environment, expiresIn, name }: CreateServiceToken) => {
    // type guard
    if (!latestFileKey) return '';
    try {
      // crypo calculation to generate the key
      const key = decryptAssymmetric({
        ciphertext: latestFileKey.encryptedKey,
        nonce: latestFileKey.nonce,
        publicKey: latestFileKey.sender.publicKey,
        privateKey: localStorage.getItem('PRIVATE_KEY') as string
      });
      const randomBytes = crypto.randomBytes(16).toString('hex');
      const { ciphertext, iv, tag } = encryptSymmetric({
        plaintext: key,
        key: randomBytes
      });

      const res = await createServiceToken.mutateAsync({
        encryptedKey: ciphertext,
        iv,
        tag,
        environment,
        expiresIn: Number(expiresIn),
        name,
        workspaceId: workspaceID
      });
      console.log(res);
      createNotification({
        text: 'Successfully created a service token',
        type: 'success'
      });
      return res.serviceToken;
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to create a service token',
        type: 'error'
      });
    }
    return '';
  };

  const onDeleteServiceToken = async (tokenID: string) => {
    try {
      await deleteServiceToken.mutateAsync(tokenID);
      createNotification({
        text: 'Successfully revoked service token',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to delete service token',
        type: 'error'
      });
    }
  };

  return (
    <div className="container mx-auto flex flex-col px-8 text-mineshaft-50">
      {/* TODO(akhilmhdh): Remove this right when layout is refactored  */}
      <div className="relative right-5">
        <NavHeader pageName={t('settings-project:title')} isProjectRelated />
      </div>
      <div className="my-8 flex max-w-5xl flex-row items-center justify-between text-xl">
        <div className="flex flex-col items-start justify-start text-3xl">
          <p className="mr-4 font-semibold text-gray-200">{t('settings-project:title')}</p>
          <p className="mr-4 text-base font-normal text-gray-400">
            {t('settings-project:description')}
          </p>
        </div>
      </div>
      <ProjectNameChangeSection
        workspaceName={currentWorkspace?.name}
        onProjectNameChange={onRenameWorkspace}
      />
      <CopyProjectIDSection workspaceID={currentWorkspace?._id || ''} />
      <EnvironmentSection
        environments={currentWorkspace?.environments || []}
        onCreate={onCreateWsEnv}
        onDelete={onDeleteWsEnv}
        onUpdate={onUpdateWsEnv}
        isEnvServiceAllowed={isEnvServiceAllowed}
      />
      <ServiceTokenSection
        tokens={serviceTokens || []}
        environments={currentWorkspace?.environments || []}
        onDeleteToken={onDeleteServiceToken}
        workspaceName={currentWorkspace?.name || ''}
        onCreateToken={onCreateServiceToken}
      />
      <div className="mb-6 mt-4 flex w-full flex-col items-start rounded-md border-l border-red bg-white/5 px-6 pl-6 pb-4 pt-4">
        <p className="text-xl font-bold text-red">{t('settings-project:danger-zone')}</p>
        <p className="text-md mt-2 text-gray-400">{t('settings-project:danger-zone-note')}</p>
        <div className="mr-auto mt-4 max-h-28 w-full max-w-md">
          <FormControl
            label={
              <div className="mb-0.5 text-sm font-normal text-gray-400">
                Type <span className="font-bold">{currentWorkspace?.name}</span> to delete the
                workspace
              </div>
            }
          >
            <Input
              onChange={(e) => setDeleteProjectInput(e.target.value)}
              value={deleteProjectInput}
              placeholder="Type the project name to delete"
            />
          </FormControl>
        </div>
        <Button
          colorSchema="danger"
          onClick={onDeleteWorkspace}
          isDisabled={deleteProjectInput !== currentWorkspace?.name || isDeleting}
          isLoading={isDeleting}
        >
          {t('settings-project:delete-project')}
        </Button>
        <p className="mt-3 ml-0.5 text-xs text-gray-500">
          {t('settings-project:delete-project-note')}
        </p>
      </div>
    </div>
  );
};
