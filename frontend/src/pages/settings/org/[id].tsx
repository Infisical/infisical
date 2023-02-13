/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { faCheck, faMagnifyingGlass, faPlus, faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { plans } from 'public/data/frequentConstants';

import Button from '@app/components/basic/buttons/Button';
import AddIncidentContactDialog from '@app/components/basic/dialog/AddIncidentContactDialog';
import AddUserDialog from '@app/components/basic/dialog/AddUserDialog';
import UpgradePlanModal from '@app/components/basic/dialog/UpgradePlan';
import InputField from '@app/components/basic/InputField';
import UserTable from '@app/components/basic/table/UserTable';
import NavHeader from '@app/components/navigation/NavHeader';
import guidGenerator from '@app/components/utilities/randomId';
import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';

import addUserToOrg from '../../api/organization/addUserToOrg';
import deleteIncidentContact from '../../api/organization/deleteIncidentContact';
import getIncidentContacts from '../../api/organization/getIncidentContacts';
import getOrganization from '../../api/organization/GetOrg';
import getOrganizationSubscriptions from '../../api/organization/GetOrgSubscription';
import getOrganizationUsers from '../../api/organization/GetOrgUsers';
import renameOrg from '../../api/organization/renameOrg';
import getUser from '../../api/user/getUser';
import deleteWorkspace from '../../api/workspace/deleteWorkspace';
import getWorkspaces from '../../api/workspace/getWorkspaces';

export default function SettingsOrg() {
  const [buttonReady, setButtonReady] = useState(false);
  const router = useRouter();
  const host = window.location.origin;
  const [orgName, setOrgName] = useState('');
  const [emailUser, setEmailUser] = useState('');
  const [workspaceToBeDeletedName, setWorkspaceToBeDeletedName] = useState('');
  const [searchUsers, setSearchUsers] = useState('');
  const [isAddIncidentContactOpen, setIsAddIncidentContactOpen] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(router.asPath.split('?')[1] === 'invite');
  const [incidentContacts, setIncidentContacts] = useState<string[]>([]);
  const [searchIncidentContact, setSearchIncidentContact] = useState('');
  const [userList, setUserList] = useState<any[]>([]);
  const [personalEmail, setPersonalEmail] = useState('');
  const [email, setEmail] = useState('');
  const [currentPlan, setCurrentPlan] = useState('');

  const workspaceId = router.query.id as string;

  const { t } = useTranslation();

  useEffect(() => {
    (async () => {
      const orgId = localStorage.getItem('orgData.id') as string;
      const org = await getOrganization({
        orgId
      });

      setOrgName(org.name);
      const incidentContactsData = await getIncidentContacts(
        localStorage.getItem('orgData.id') as string
      );

      setIncidentContacts(incidentContactsData?.map((contact) => contact.email));

      const user = await getUser();
      setPersonalEmail(user.email);

      const orgUsers = await getOrganizationUsers({
        orgId
      });

      setUserList(
        orgUsers.map((orgUser) => ({
          key: guidGenerator(),
          firstName: orgUser.user?.firstName,
          lastName: orgUser.user?.lastName,
          email: orgUser.user?.email == null ? orgUser.inviteEmail : orgUser.user?.email,
          role: orgUser?.role,
          status: orgUser?.status,
          userId: orgUser.user?._id,
          membershipId: orgUser._id,
          publicKey: orgUser.user?.publicKey
        }))
      );

      const subscriptions = await getOrganizationSubscriptions({
        orgId
      });
      if (subscriptions) {
        setCurrentPlan(subscriptions.data[0].plan.product);
      }
    })();
  }, []);

  const modifyOrgName = (newName: string) => {
    setButtonReady(true);
    setOrgName(newName);
  };

  const submitChanges = (newOrgName: string) => {
    renameOrg(localStorage.getItem('orgData.id') as string, newOrgName);
    setButtonReady(false);
  };

  const closeAddUserModal = () => {
    setIsAddUserOpen(false);
  };

  const closeAddIncidentContactModal = () => {
    setIsAddIncidentContactOpen(false);
  };

  const openAddUserModal = () => {
    setIsAddUserOpen(true);
  };

  const openAddIncidentContactModal = () => {
    setIsAddIncidentContactOpen(true);
  };

  const submitAddUserModal = async (newUserEmail: string) => {
    await addUserToOrg(newUserEmail, localStorage.getItem('orgData.id') as string);
    setEmail('');
    setIsAddUserOpen(false);
    router.reload();
  };

  const deleteIncidentContactFully = (incidentContact: string) => {
    setIncidentContacts(incidentContacts.filter((contact) => contact !== incidentContact));
    deleteIncidentContact(localStorage.getItem('orgData.id') as string, incidentContact);
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

  return (
    <div className="bg-bunker-800 max-h-screen flex flex-col justify-between text-white">
      <Head>
        <title>{t('common:head-title', { title: t('settings-org:title') })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex flex-row">
        <div className="w-full max-h-screen pb-2">
          <NavHeader pageName={t('settings-org:title')} />
          <AddIncidentContactDialog
            isOpen={isAddIncidentContactOpen}
            closeModal={closeAddIncidentContactModal}
            incidentContacts={incidentContacts}
            setIncidentContacts={setIncidentContacts}
          />
          <div className="flex flex-row justify-between items-center ml-6 my-8 text-xl max-w-5xl">
            <div className="flex flex-col justify-start items-start text-3xl">
              <p className="font-semibold mr-4 text-gray-200">{t('settings-org:title')}</p>
              <p className="font-normal mr-4 text-gray-400 text-base">
                {t('settings-org:description')}
              </p>
            </div>
          </div>
          <div className="flex flex-col ml-6 text-mineshaft-50 mr-6 max-w-8xl">
            <div className="flex flex-col">
              <div className="min-w-md mt-2 flex flex-col items-end pb-4">
                <div className="bg-white/5 rounded-md px-6 py-4 flex flex-col items-start w-full mb-6">
                  <div className="max-h-28 w-full max-w-md mr-auto">
                    <p className="font-semibold mr-4 text-gray-200 text-xl mb-2">
                      {t('common:display-name')}
                    </p>
                    <InputField
                      label=""
                      // label="Organization Name"
                      onChangeHandler={modifyOrgName}
                      type="varName"
                      value={orgName}
                      placeholder=""
                      isRequired
                    />
                  </div>
                  <div className="flex justify-start w-full">
                    <div className="flex justify-start max-w-sm mt-4 mb-2">
                      <Button
                        text={t('common:save-changes') as string}
                        onButtonPressed={() => submitChanges(orgName)}
                        color="mineshaft"
                        size="md"
                        active={buttonReady}
                        iconDisabled={faCheck}
                        textDisabled={t('common:saved') as string}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white/5 rounded-md px-6 pt-6 pb-2 flex flex-col items-start w-full mb-6">
              <p className="font-semibold mr-4 text-white text-xl">
                {t('section-members:org-members')}
              </p>
              <p className="mr-4 text-gray-400 mt-2 mb-2">
                {t('section-members:org-members-description')}
              </p>
              <AddUserDialog
                isOpen={isAddUserOpen && (userList.length < 5 || currentPlan !== plans.starter || host !== 'https://app.infisical.com')}
                closeModal={closeAddUserModal}
                submitModal={submitAddUserModal}
                email={emailUser}
                setEmail={setEmailUser}
                currentPlan={currentPlan}
                orgName={orgName}
              />
              <UpgradePlanModal
                isOpen={isAddUserOpen && userList.length >= 5 && currentPlan === plans.starter && host === 'https://app.infisical.com'}
                onClose={closeAddUserModal}
                text="You can add more members if you switch to Infisical's Team plan."
              />
              {/* <DeleteUserDialog isOpen={isDeleteOpen} closeModal={closeDeleteModal} submitModal={deleteMembership} userIdToBeDeleted={userIdToBeDeleted}/> */}
              <div className="pb-1 w-full flex flex-row items-start">
                <div className="h-10 w-full bg-white/5 mt-2 flex items-center rounded-md flex-row ">
                  <FontAwesomeIcon
                    className="bg-white/5 rounded-l-md py-3 pl-4 pr-2 text-gray-400"
                    icon={faMagnifyingGlass}
                  />
                  <input
                    className="pl-2 text-gray-400 rounded-r-md bg-white/5 w-full h-full outline-none"
                    value={searchUsers}
                    onChange={(e) => setSearchUsers(e.target.value)}
                    placeholder={t('section-members:search-members') as string}
                  />
                </div>
                <div className="mt-2 ml-2 min-w-max flex flex-row items-start justify-start">
                  <Button
                    text={t('section-members:add-member') as string}
                    onButtonPressed={openAddUserModal}
                    color="mineshaft"
                    size="md"
                    icon={faPlus}
                  />
                </div>
              </div>
              {userList && (
                <div className="overflow-y-auto w-full">
                  <UserTable
                    userData={userList}
                    changeData={setUserList}
                    myUser={personalEmail}
                    filter={searchUsers.toLowerCase()}
                    resendInvite={submitAddUserModal}
                    isOrg
                    // onClick={openDeleteModal}
                    // deleteUser={deleteMembership}
                    // setUserIdToBeDeleted={setUserIdToBeDeleted}
                  />
                </div>
              )}
            </div>

            <div className="bg-white/5 rounded-md px-6 pt-6 pb-6 flex flex-col items-start w-full mb-6 mt-4">
              <div className="flex flex-row max-w-5xl justify-between items-center w-full">
                <div className="flex flex-col justify-between w-full max-w-3xl">
                  <p className="text-xl font-semibold mb-3 min-w-max">
                    {t('section-incident:incident-contacts')}
                  </p>
                  <p className="text-xs text-gray-500 mb-2 min-w-max">
                    {t('section-incident:incident-contacts-description')}
                  </p>
                </div>
                <div className="mt-4 mb-2 min-w-max flex flex-row items-end justify-center">
                  <Button
                    text={t('section-incident:add-contact') as string}
                    onButtonPressed={openAddIncidentContactModal}
                    color="mineshaft"
                    size="md"
                    icon={faPlus}
                  />
                </div>
              </div>
              <div className="h-12 w-full max-w-5xl bg-white/5 mt-2 flex items-center rounded-t-md flwex-row">
                <FontAwesomeIcon
                  className="bg-white/5 rounded-tl-md py-4 pl-4 pr-2 text-gray-400"
                  icon={faMagnifyingGlass}
                />
                <input
                  className="pl-2 text-gray-400 rounded-tr-md bg-white/5 w-full h-full outline-none"
                  value={searchIncidentContact}
                  onChange={(e) => setSearchIncidentContact(e.target.value)}
                  placeholder={t('common:search') as string}
                />
              </div>
              {incidentContacts?.filter((incidentEmail) =>
                incidentEmail.includes(searchIncidentContact)
              ).length > 0 ? (
                incidentContacts
                  .filter((incidentEmail) => incidentEmail.includes(searchIncidentContact))
                  .map((contact) => (
                    <div
                      key={guidGenerator()}
                      className="flex flex-row items-center justify-between max-w-5xl px-4 py-3 hover:bg-white/5 border-t border-gray-600 w-full"
                    >
                      <p className="text-gray-300">{contact}</p>
                      <div className="opacity-50 hover:opacity-100 duration-200">
                        <Button
                          onButtonPressed={() => deleteIncidentContactFully(contact)}
                          color="red"
                          size="icon-sm"
                          icon={faX}
                        />
                      </div>
                    </div>
                  ))
              ) : (
                <div className="w-full flex flex-row justify-center mt-6 max-w-4xl ml-6">
                  <p className="text-gray-400">{t('section-incident:no-incident-contacts')}</p>
                </div>
              )}
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
      </div>
    </div>
  );
}

SettingsOrg.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps([
  'settings',
  'settings-org',
  'section-incident',
  'section-members'
]);
