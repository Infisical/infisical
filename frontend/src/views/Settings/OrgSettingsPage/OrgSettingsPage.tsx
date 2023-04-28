/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { plans } from 'public/data/frequentConstants';

import InputField from '@app/components/basic/InputField';
import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import NavHeader from '@app/components/navigation/NavHeader';
import {
  decryptAssymmetric,
  encryptAssymmetric
} from '@app/components/utilities/cryptography/crypto';
import { Input } from '@app/components/v2';
import { useOrganization, useSubscription, useUser, useWorkspace } from '@app/context';
import {
  useAddIncidentContact,
  useAddUserToOrg,
  useDeleteIncidentContact,
  useDeleteOrgMembership,
  useGetOrgIncidentContact,
  useGetOrgUsers,
  useGetUserWorkspaceMemberships,
  useGetUserWsKey,
  useRenameOrg,
  useUpdateOrgUserRole,
  useUploadWsKey
} from '@app/hooks/api';
import { useDeleteOrganization } from '@app/hooks/api/organization/queries';

import {
  OrgIncidentContactsTable,
  OrgMembersTable,
  OrgNameChangeSection,
  OrgServiceAccountsTable
} from './components';

export const OrgSettingsPage = () => {
  const host = window.location.origin;
  const router = useRouter();

  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();
  const { user } = useUser();
  const { subscriptionPlan } = useSubscription();
  const { createNotification } = useNotificationContext();

  const orgId = currentOrg?._id || '';

  const { data: orgUsers, isLoading: isOrgUserLoading } = useGetOrgUsers(orgId);
  const { data: workspaceMemberships, isLoading: IsWsMembershipLoading } =
    useGetUserWorkspaceMemberships(orgId);
  const { data: wsKey } = useGetUserWsKey(currentWorkspace?._id || '');
  const { data: incidentContact, isLoading: IsIncidentContactLoading } =
    useGetOrgIncidentContact(orgId);

  const renameOrg = useRenameOrg();
  const removeUserOrgMembership = useDeleteOrgMembership();
  const addUserToOrg = useAddUserToOrg();
  const updateOrgUserRole = useUpdateOrgUserRole();
  const uploadWsKey = useUploadWsKey();
  const addIncidentContact = useAddIncidentContact();
  const removeIncidentContact = useDeleteIncidentContact();
  const deleteOrganization = useDeleteOrganization();

  const [completeInviteLink, setcompleteInviteLink] = useState<string | undefined>('');
  const [organizationToBeDeletedName, setOrganizationToBeDeletedName] = useState('');

  const isMoreUsersNotAllowed =
    (orgUsers || []).length >= 5 &&
    subscriptionPlan === plans.starter &&
    host === 'https://app.infisical.com' &&
    currentWorkspace?._id !== '63ea8121b6e2b0543ba79616' && 
    currentWorkspace?._id !== '634870246fd2e26f28e76996' &&
    currentWorkspace?._id !== '63d823cef9e728a0a961255a' &&
    currentWorkspace?._id !== '6412ec319db25595ac00b8c6';

  const onRenameOrg = async (name: string) => {
    if (!currentOrg?._id) return;

    try {
      await renameOrg.mutateAsync({ orgId: currentOrg?._id, newOrgName: name });
      createNotification({
        text: 'Successfully renamed organization',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to rename organization',
        type: 'error'
      });
    }
  };

  const onRemoveUserOrgMembership = async (membershipId: string) => {
    if (!currentOrg?._id) return;

    try {
      await removeUserOrgMembership.mutateAsync({ orgId: currentOrg?._id, membershipId });
      createNotification({
        text: 'Successfully removed user from org',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to remove user from the organization',
        type: 'error'
      });
    }
  };
  const onAddUserToOrg = async (email: string) => {
    if (!currentOrg?._id) return;

    try {
      const { data } = await addUserToOrg.mutateAsync({
        organizationId: currentOrg?._id,
        inviteeEmail: email
      });
      setcompleteInviteLink(data?.completeInviteLink);

      // only show this notification when email is configured. A [completeInviteLink] will not be sent if smtp is configured
      if (!data.completeInviteLink) {
        createNotification({
          text: 'Successfully invited user to the organization.',
          type: 'success'
        });
      }
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to invite user to org',
        type: 'error'
      });
    }
  };

  const onUpdateOrgUserRole = async (membershipId: string, role: string) => {
    if (!currentOrg?._id) return;

    try {
      await updateOrgUserRole.mutateAsync({ organizationId: currentOrg?._id, membershipId, role });
      createNotification({
        text: 'Successfully updated user role',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to update user role',
        type: 'error'
      });
    }
  };

  const onGrantUserAccess = async (userId: string, publicKey: string) => {
    try {
      const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY') as string;
      if (!PRIVATE_KEY || !wsKey) return;

      // assymmetrically decrypt symmetric key with local private key
      const key = decryptAssymmetric({
        ciphertext: wsKey.encryptedKey,
        nonce: wsKey.nonce,
        publicKey: wsKey.sender.publicKey,
        privateKey: PRIVATE_KEY
      });

      const { ciphertext, nonce } = encryptAssymmetric({
        plaintext: key,
        publicKey,
        privateKey: PRIVATE_KEY
      });

      await uploadWsKey.mutateAsync({
        userId,
        nonce,
        encryptedKey: ciphertext,
        workspaceId: currentWorkspace?._id || ''
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: 'Failed to grant access to user',
        type: 'error'
      });
    }
  };

  const onAddIncidentContact = async (email: string) => {
    if (!currentOrg?._id) return;

    try {
      await addIncidentContact.mutateAsync({ orgId, email });
      createNotification({
        text: 'Successfully added incident contact',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to add incident contact',
        type: 'error'
      });
    }
  };

  const onRemoveIncidentContact = async (email: string) => {
    if (!currentOrg?._id) return;

    try {
      await removeIncidentContact.mutateAsync({ orgId, email });
      createNotification({
        text: 'Successfully removed incident contact',
        type: 'success'
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to remove incident contact',
        type: 'error'
      });
    }
  };

  /**
   * This function deleted a workspace.
   * It first checks if there is more than one workspace available. Otherwise, it doesn't delete
   * It then checks if the name of the workspace to be deleted is correct. Otherwise, it doesn't delete.
   * It then deletes the workspace and forwards the user to another available workspace.
   */
  const executeDeletingOrganization = async () => {
    try{
    await deleteOrganization.mutateAsync({ organizationId: currentOrg?._id! })
    localStorage.removeItem('orgData.id')
    router.push('/dashboard')
    createNotification({
      text: 'Successfully deleted organization',
      type: 'success'
    })
    }catch (error) {
      console.error(error);
      createNotification({
        text: 'Failed to delete organization',
        type: 'error'
      })
    }
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <NavHeader pageName={t('settings-org:title')} />
      <div className="my-8 ml-8 max-w-5xl">
        <p className="text-3xl font-semibold text-gray-200">{t('settings-org:title')}</p>
        <p className="text-base font-normal text-gray-400">{t('settings-org:description')}</p>
      </div>
      <div className="max-w-8xl ml-6 mr-6 flex flex-col text-mineshaft-50">
        <OrgNameChangeSection orgName={currentOrg?.name} onOrgNameChange={onRenameOrg} />
        <div className="mb-6 w-full rounded-md bg-white/5 p-6">
          <p className="mr-4 mb-4 text-xl font-semibold text-white">
            {t('section-members:org-members')}
          </p>
          <OrgMembersTable
            isLoading={isOrgUserLoading || IsWsMembershipLoading}
            isMoreUserNotAllowed={isMoreUsersNotAllowed}
            orgName={currentOrg?.name || ''}
            members={orgUsers}
            workspaceMemberships={workspaceMemberships}
            onInviteMember={onAddUserToOrg}
            userId={user?._id || ''}
            onRemoveMember={onRemoveUserOrgMembership}
            onRoleChange={onUpdateOrgUserRole}
            onGrantAccess={onGrantUserAccess}
            completeInviteLink={completeInviteLink}
            setCompleteInviteLink={setcompleteInviteLink}
          />
        </div>
        <div className="mb-6 mt-2 w-full rounded-md bg-white/5 p-6">
          <p className="mr-4 mb-4 text-xl font-semibold text-white">Service Accounts</p>
          <OrgServiceAccountsTable />
        </div>
        <div className="mb-6 mt-2 flex w-full flex-col items-start rounded-md bg-white/5 px-6 pt-6 pb-6">
          <div className="flex w-full max-w-5xl flex-row items-center justify-between">
            <div className="flex w-full max-w-3xl flex-col justify-between">
              <p className="mb-3 min-w-max text-xl font-semibold">
                {t('section-incident:incident-contacts')}
              </p>
              <p className="mb-2 min-w-max text-xs text-gray-500">
                {t('section-incident:incident-contacts-description')}
              </p>
            </div>
          </div>
          <div className="w-full">
            <OrgIncidentContactsTable
              isLoading={IsIncidentContactLoading}
              contacts={incidentContact}
              onRemoveContact={onRemoveIncidentContact}
              onAddContact={onAddIncidentContact}
            />
          </div>
        </div>
        <div className="mb-6 mt-4 flex w-full max-w-6xl flex-col items-start border-l border-red pb-4 pl-6 pt-2">
          <p className="text-xl font-bold text-red">Danger Zone</p>
          <p className="text-md mt-4 text-gray-400">
            As soon as you delete an organization, you will not be able to undo it. This will
            immediately remove all organization members and cancel your subscription. If you still
            want to do that, please enter the name of the organization below.
          </p>
          <div className="mr-auto mt-8 max-h-28 w-full max-w-xl">
            <p className='text-md my-2 text-gray-400'>Organization to be deleted</p>
            <Input
              placeholder="Organization name"
              onChange={(e) => setOrganizationToBeDeletedName(e.target.value)}
              type="varName"
              value={organizationToBeDeletedName}
              isRequired
            />
          </div>
          <button
            type="button"
            className="hover:text-semibold mt-6 inline-flex w-full max-w-xl justify-center rounded-md border border-transparent bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-400 duration-200 hover:bg-red hover:font-bold hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            onClick={executeDeletingOrganization}
          >
            Delete Organization
          </button>
        </div>
      </div>
    </div>
  );
};
