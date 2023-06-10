/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { plans } from 'public/data/frequentConstants';

import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import NavHeader from '@app/components/navigation/NavHeader';
import {
  decryptAssymmetric,
  encryptAssymmetric
} from '@app/components/utilities/cryptography/crypto';
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

import {
  OrgIncidentContactsTable,
  OrgMembersTable,
  OrgNameChangeSection,
  OrgServiceAccountsTable
} from './components';

export const OrgSettingsPage = () => {
  const host = window.location.origin;

  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();
  const { user } = useUser();
  const { subscription } = useSubscription();
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

  const [completeInviteLink, setcompleteInviteLink] = useState<string | undefined>('');

  const isMoreUsersNotAllowed = ((subscription?.membersUsed || 0) >= (subscription?.membersLimit || 1)) && host === 'https://app.infisical.com';

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
  // const executeDeletingWorkspace = async () => {
  //   const userWorkspaces = await getWorkspaces();
  //
  //   if (userWorkspaces.length > 1) {
  //     if (
  //       userWorkspaces.filter((workspace) => workspace._id === workspaceId)[0].name ===
  //       workspaceToBeDeletedName
  //     ) {
  //       await deleteWorkspace(workspaceId);
  //       const ws = await getWorkspaces();
  //       router.push(`/dashboard/${ws[0]._id}`);
  //     }
  //   }
  // };
  //
  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <NavHeader pageName={t('settings.org.title')} />
      <div className="my-8 ml-8 max-w-5xl">
        <p className="text-3xl font-semibold text-gray-200">{t('settings.org.title')}</p>
        <p className="text-base font-normal text-gray-400">{t('settings.org.description')}</p>
      </div>
      <div className="max-w-8xl ml-6 mr-6 flex flex-col text-mineshaft-50">
        <OrgNameChangeSection orgName={currentOrg?.name} onOrgNameChange={onRenameOrg} />
        <div className="mb-6 w-full rounded-md bg-white/5 p-6">
          <p className="mr-4 mb-4 text-xl font-semibold text-white">
            {t('section.members.org-members')}
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
                {t('section.incident.incident-contacts')}
              </p>
              <p className="mb-2 min-w-max text-xs text-gray-500">
                {t('section.incident.incident-contacts-description')}
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
        {/* <div className="border-l border-red pb-4 pl-6 flex flex-col items-start flex flex-col items-start w-full mb-6 mt-4 pt-2 max-w-6xl">
							<p className="text-xl font-bold text-red">
								Danger Zone
							</p>
							<p className="mt-4 text-md text-gray-400">
								As soon as you delete an organization, you will
								not be able to undo it. This will immediately
								remove all organization members and cancel your
								subscription. If you still want to do that,
								please enter the name of the organization below.
							</p>
							<div className="max-h-28 w-full max-w-xl mr-auto mt-8 max-w-xl">
								<InputField
									label="Organization to be Deleted"
									onChangeHandler={
										setWorkspaceToBeDeletedName
									}
									type="varName"
									value={workspaceToBeDeletedName}
									placeholder=""
									isRequired
								/>
							</div>
							<button
								type="button"
								className="mt-6 w-full max-w-xl inline-flex justify-center rounded-md border border-transparent bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-400 hover:bg-red hover:text-white hover:font-bold hover:text-semibold duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
								onClick={executeDeletingWorkspace}
							>
								Delete Project
							</button>
							<p className="mt-0.5 ml-1 text-xs text-gray-500">
								Note: You can only delete a project in case you
								have more than one.
							</p>
						</div> */}
      </div>
    </div>
  );
};
