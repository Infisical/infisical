import crypto from 'crypto';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';

import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import NavHeader from '@app/components/navigation/NavHeader';
// TODO(akhilmhdh):Refactor this into a better utility module package
import {
  decryptAssymmetric,
  decryptSymmetric,
  encryptSymmetric
} from '@app/components/utilities/cryptography/crypto';
import { Button, FormControl, Input } from '@app/components/v2';
import { plans } from '@app/const';
import { useSubscription, useWorkspace } from '@app/context';
import { useToggle } from '@app/hooks';
import {
  useCreateServiceToken,
  useCreateWsEnvironment,
  useCreateWsTag,
  useDeleteServiceToken,
  useDeleteWorkspace,
  useDeleteWsEnvironment,
  useDeleteWsTag,
  useGetUserWsKey,
  useGetUserWsServiceTokens,
  useGetWorkspaceIndexStatus,
  useGetWorkspaceSecrets,
  useGetWsTags,
  useNameWorkspaceSecrets,
  useRenameWorkspace,
  useToggleAutoCapitalization,
  useUpdateWsEnvironment
} from '@app/hooks/api';

import { AutoCapitalizationSection } from './components/AutoCapitalizationSection/AutoCapitalizationSection';
import { SecretTagsSection } from './components/SecretTagsSection';
import {
  CopyProjectIDSection,
  CreateServiceToken,
  CreateUpdateEnvFormData,
  CreateWsTag,
  EnvironmentSection,
  ProjectIndexSecretsSection,
  ProjectNameChangeSection,
  ServiceTokenSection
} from './components';

export const ProjectSettingsPage = () => {
  const { t } = useTranslation();
  const { currentWorkspace, workspaces, isLoading: isWorkspaceLoading } = useWorkspace();
  const router = useRouter();

  const workspaceID = currentWorkspace?._id || '';
  const { createNotification } = useNotificationContext();
  // delete action worksapce
  const [deleteProjectInput, setDeleteProjectInput] = useState('');
  const [isDeleting, setIsDeleting] = useToggle();

  const renameWorkspace = useRenameWorkspace();
  const nameWorkspaceSecrets = useNameWorkspaceSecrets();
  const toggleAutoCapitalization = useToggleAutoCapitalization();

  const deleteWorkspace = useDeleteWorkspace();
  // env crud operation
  const createWsEnv = useCreateWsEnvironment();
  const updateWsEnv = useUpdateWsEnvironment();
  const deleteWsEnv = useDeleteWsEnvironment();

  const { data: isBlindIndexed, isLoading: isBlindIndexedLoading } =
    useGetWorkspaceIndexStatus(workspaceID);

  // service token
  const { data: serviceTokens, isLoading: isServiceTokenLoading } = useGetUserWsServiceTokens({
    workspaceID: currentWorkspace?._id || ''
  });

  const { data: latestFileKey } = useGetUserWsKey(workspaceID);
  const { data: encryptedSecrets } = useGetWorkspaceSecrets(workspaceID);

  const createServiceToken = useCreateServiceToken();
  const deleteServiceToken = useDeleteServiceToken();

  // tag
  const { data: wsTags, isLoading: isTagLoading } = useGetWsTags(workspaceID);
  const createWsTag = useCreateWsTag();
  const deleteWsTag = useDeleteWsTag();

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

  const onAutoCapitalizationToggle = async (state: boolean) => {
    try {
      await toggleAutoCapitalization.mutateAsync({
        workspaceID,
        state
      });
      const text = `Successfully ${state ? 'enabled' : 'disabled'} auto capitalization`;
      createNotification({
        text,
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to update auto capitalization',
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
      if (!ws) {
        router.push('/noprojects');
      }
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

  const onCreateServiceToken = async ({
    environment,
    expiresIn,
    name,
    permissions,
    secretPath
  }: CreateServiceToken) => {
    // type guard
    if (!latestFileKey) return '';
    try {
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
        secretPath,
        expiresIn: Number(expiresIn),
        name,
        workspaceId: workspaceID,
        randomBytes,
        permissions: Object.entries(permissions)
          .filter(([, permissionsValue]) => permissionsValue)
          .map(([permissionsKey]) => permissionsKey)
      });

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

  const onCreateWsTag = async ({ name }: CreateWsTag) => {
    try {
      const res = await createWsTag.mutateAsync({
        workspaceID,
        tagName: name,
        tagSlug: name.replace(' ', '_')
      });
      createNotification({
        text: 'Successfully created a tag',
        type: 'success'
      });
      return res.name;
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to create a tag',
        type: 'error'
      });
    }
    return '';
  };

  const onDeleteTag = async (tagID: string) => {
    try {
      await deleteWsTag.mutateAsync({ tagID });
      createNotification({
        text: 'Successfully deleted tag',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to delete the tag',
        type: 'error'
      });
    }
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

  const onEnableBlindIndices = async () => {
    if (!currentWorkspace?._id) return;
    if (!encryptedSecrets) return;
    if (!latestFileKey) return;

    const key = decryptAssymmetric({
      ciphertext: latestFileKey.encryptedKey,
      nonce: latestFileKey.nonce,
      publicKey: latestFileKey.sender.publicKey,
      privateKey: localStorage.getItem('PRIVATE_KEY') as string
    });

    const secretsToUpdate = encryptedSecrets.map((encryptedSecret) => {
      const secretName = decryptSymmetric({
        ciphertext: encryptedSecret.secretKeyCiphertext,
        iv: encryptedSecret.secretKeyIV,
        tag: encryptedSecret.secretKeyTag,
        key
      });

      return {
        secretName,
        _id: encryptedSecret._id
      };
    });

    await nameWorkspaceSecrets.mutateAsync({
      workspaceId: currentWorkspace._id,
      secretsToUpdate
    });
  };

  return (
    <div className="dark container mx-auto flex flex-col px-8 text-mineshaft-50 dark:[color-scheme:dark]">
      {/* TODO(akhilmhdh): Remove this right when layout is refactored  */}
      <div className="relative right-5">
        <NavHeader pageName={t('settings.project.title')} isProjectRelated />
      </div>
      <div className="my-8 flex max-w-5xl flex-row items-center justify-between text-xl">
        <div className="flex flex-col items-start justify-start text-3xl">
          <p className="mr-4 font-semibold text-gray-200">{t('settings.project.title')}</p>
          <p className="mr-4 text-base font-normal text-gray-400">
            {t('settings.project.description')}
          </p>
        </div>
      </div>
      <ProjectNameChangeSection
        workspaceName={currentWorkspace?.name}
        onProjectNameChange={onRenameWorkspace}
      />
      <CopyProjectIDSection workspaceID={currentWorkspace?._id || ''} />
      <EnvironmentSection
        isLoading={isWorkspaceLoading}
        environments={currentWorkspace?.environments || []}
        onCreate={onCreateWsEnv}
        onDelete={onDeleteWsEnv}
        onUpdate={onUpdateWsEnv}
        isEnvServiceAllowed={isEnvServiceAllowed}
      />
      <ServiceTokenSection
        isLoading={isServiceTokenLoading}
        tokens={serviceTokens || []}
        environments={currentWorkspace?.environments || []}
        onDeleteToken={onDeleteServiceToken}
        workspaceName={currentWorkspace?.name || ''}
        onCreateToken={onCreateServiceToken}
      />
      <SecretTagsSection
        isLoading={isTagLoading}
        tags={wsTags || []}
        onDeleteTag={onDeleteTag}
        workspaceName={currentWorkspace?.name || ''}
        onCreateTag={onCreateWsTag}
      />
      <AutoCapitalizationSection
        workspaceAutoCapitalization={currentWorkspace?.autoCapitalization}
        onAutoCapitalizationChange={onAutoCapitalizationToggle}
      />
      {!isBlindIndexedLoading && !isBlindIndexed && (
        <ProjectIndexSecretsSection onEnableBlindIndices={onEnableBlindIndices} />
      )}
      <div className="mb-6 mt-4 flex w-full flex-col items-start rounded-md border-l border-red bg-white/5 px-6 pl-6 pb-4 pt-4">
        <p className="text-xl font-bold text-red">{t('settings.project.danger-zone')}</p>
        <p className="text-md mt-2 text-gray-400">{t('settings.project.danger-zone-note')}</p>
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
          {t('settings.project.delete-project')}
        </Button>
        <p className="mt-3 ml-0.5 text-xs text-gray-500">
          {t('settings.project.delete-project-note')}
        </p>
      </div>
    </div>
  );
};
