import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  faMagnifyingGlass,
  faPlus,
  faX
} from '@fortawesome/free-solid-svg-icons';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '~/components/basic/buttons/Button';
import AddIncidentContactDialog from '~/components/basic/dialog/AddIncidentContactDialog';
import AddUserDialog from '~/components/basic/dialog/AddUserDialog';
import InputField from '~/components/basic/InputField';
import UserTable from '~/components/basic/table/UserTable';
import NavHeader from '~/components/navigation/NavHeader';
import guidGenerator from '~/utilities/randomId';

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
  const [orgName, setOrgName] = useState('');
  const [emailUser, setEmailUser] = useState('');
  const [workspaceToBeDeletedName, setWorkspaceToBeDeletedName] = useState('');
  const [searchUsers, setSearchUsers] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [isAddIncidentContactOpen, setIsAddIncidentContactOpen] =
    useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(
    router.asPath.split('?')[1] == 'invite'
  );
  const [incidentContacts, setIncidentContacts] = useState([]);
  const [searchIncidentContact, setSearchIncidentContact] = useState('');
  const [userList, setUserList] = useState();
  const [personalEmail, setPersonalEmail] = useState('');
  let workspaceIdTemp;
  const [email, setEmail] = useState('');
  const [currentPlan, setCurrentPlan] = useState('');

  useEffect(async () => {
    let org = await getOrganization({
      orgId: localStorage.getItem('orgData.id')
    });
    let orgData = org;
    setOrgName(orgData.name);
    let incidentContactsData = await getIncidentContacts(
      localStorage.getItem('orgData.id')
    );

    setIncidentContacts(incidentContactsData?.map((contact) => contact.email));

    const user = await getUser();
    setPersonalEmail(user.email);

    workspaceIdTemp = router.query.id;
    let orgUsers = await getOrganizationUsers({
      orgId: localStorage.getItem('orgData.id')
    });
    setUserList(
      orgUsers.map((user) => ({
        key: guidGenerator(),
        firstName: user.user?.firstName,
        lastName: user.user?.lastName,
        email: user.user?.email == null ? user.inviteEmail : user.user?.email,
        role: user?.role,
        status: user?.status,
        userId: user.user?._id,
        membershipId: user._id,
        publicKey: user.user?.publicKey
      }))
    );
    const subscriptions = await getOrganizationSubscriptions({
      orgId: localStorage.getItem('orgData.id')
    });
    setCurrentPlan(subscriptions.data[0].plan.product);
  }, []);

  const modifyOrgName = (newName) => {
    setButtonReady(true);
    setOrgName(newName);
  };

  const submitChanges = (newOrgName) => {
    renameOrg(localStorage.getItem('orgData.id'), newOrgName);
    setButtonReady(false);
  };

  useEffect(async () => {
    setWorkspaceId(router.query.id);
  }, []);

  function closeAddUserModal() {
    setIsAddUserOpen(false);
  }

  function closeAddIncidentContactModal() {
    setIsAddIncidentContactOpen(false);
  }

  function openAddUserModal() {
    setIsAddUserOpen(true);
  }

  function openAddIncidentContactModal() {
    setIsAddIncidentContactOpen(true);
  }

  async function submitAddUserModal(email) {
    await addUserToOrg(email, localStorage.getItem('orgData.id'));
    setEmail('');
    setIsAddUserOpen(false);
    router.reload();
  }

  const deleteIncidentContactFully = (incidentContact) => {
    setIncidentContacts(
      incidentContacts.filter((contact) => contact != incidentContact)
    );
    deleteIncidentContact(localStorage.getItem('orgData.id'), incidentContact);
  };

  /**
   * This function deleted a workspace.
   * It first checks if there is more than one workspace aviable. Otherwise, it doesn't delete
   * It then checks if the name of the workspace to be deleted is correct. Otherwise, it doesn't delete.
   * It then deletes the workspace and forwards the user to another aviable workspace.
   */
  const executeDeletingWorkspace = async () => {
    let userWorkspaces = await getWorkspaces();

    if (userWorkspaces.length > 1) {
      if (
        userWorkspaces.filter(
          (workspace) => workspace._id == router.query.id
        )[0].name == workspaceToBeDeletedName
      ) {
        await deleteWorkspace(router.query.id);
        let userWorkspaces = await getWorkspaces();
        router.push('/dashboard/' + userWorkspaces[0]._id);
      }
    }
  };

  return (
    <div className="bg-bunker-800 max-h-screen flex flex-col justify-between text-white">
      <Head>
        <title>Settings</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex flex-row">
        <div className="w-full max-h-screen pb-2 overflow-y-auto">
          <NavHeader pageName="Organization Settings" />
          <AddIncidentContactDialog
            isOpen={isAddIncidentContactOpen}
            closeModal={closeAddIncidentContactModal}
            workspaceId={workspaceId}
            incidentContacts={incidentContacts}
            setIncidentContacts={setIncidentContacts}
          />
          <div className="flex flex-row justify-between items-center ml-6 my-8 text-xl max-w-5xl">
            <div className="flex flex-col justify-start items-start text-3xl">
              <p className="font-semibold mr-4 text-gray-200">
                Organization Settings
              </p>
              <p className="font-normal mr-4 text-gray-400 text-base">
                View and manage your organization here.
              </p>
            </div>
          </div>
          <div className="flex flex-col ml-6 text-mineshaft-50 mr-6 max-w-5xl">
            <div className="flex flex-col">
              <div className="min-w-md mt-2 flex flex-col items-end pb-4">
                <div className="bg-white/5 rounded-md px-6 py-4 flex flex-col items-start flex flex-col items-start w-full mb-6">
                  <div className="max-h-28 w-full max-w-md mr-auto">
                    <p className="font-semibold mr-4 text-gray-200 text-xl mb-2">
                      Display Name
                    </p>
                    <InputField
                      // label="Organization Name"
                      onChangeHandler={modifyOrgName}
                      type="varName"
                      value={orgName}
                      placeholder=""
                      isRequired
                    />
                  </div>
                  <div className="flex justify-start w-full">
                    <div className={`flex justify-start max-w-sm mt-4 mb-2`}>
                      <Button
                        text="Save Changes"
                        onButtonPressed={() => submitChanges(orgName)}
                        color="mineshaft"
                        size="md"
                        active={buttonReady}
                        iconDisabled={faCheck}
                        textDisabled="Saved"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white/5 rounded-md px-6 pt-6 pb-2 flex flex-col items-start flex flex-col items-start w-full mb-6">
              <p className="font-semibold mr-4 text-white text-xl">
                Organization Members
              </p>
              <p className="mr-4 text-gray-400 mt-2 mb-2">
                Manage members of your organization. These users could
                afterwards be formed into projects.
              </p>
              <AddUserDialog
                isOpen={isAddUserOpen}
                closeModal={closeAddUserModal}
                submitModal={submitAddUserModal}
                email={emailUser}
                workspaceId={workspaceId}
                setEmail={setEmailUser}
                currentPlan={currentPlan}
                orgName={orgName}
              />
              {/* <DeleteUserDialog isOpen={isDeleteOpen} closeModal={closeDeleteModal} submitModal={deleteMembership} userIdToBeDeleted={userIdToBeDeleted}/> */}
              <div className="pb-1 w-full flex flex-row items-start max-w-6xl">
                <div className="h-10 w-full bg-white/5 mt-2 flex items-center rounded-md flex flex-row items-center">
                  <FontAwesomeIcon
                    className="bg-white/5 rounded-l-md py-3 pl-4 pr-2 text-gray-400"
                    icon={faMagnifyingGlass}
                  />
                  <input
                    className="pl-2 text-gray-400 rounded-r-md bg-white/5 w-full h-full outline-none"
                    value={searchUsers}
                    onChange={(e) => setSearchUsers(e.target.value)}
                    placeholder={'Search members...'}
                  />
                </div>
                <div className="mt-2 ml-2 min-w-max flex flex-row items-start justify-start">
                  <Button
                    text="Add Member"
                    onButtonPressed={openAddUserModal}
                    color="mineshaft"
                    size="md"
                    icon={faPlus}
                  />
                </div>
              </div>
              {userList && (
                <div className="overflow-y-auto max-w-6xl w-full">
                  <UserTable
                    userData={userList}
                    changeData={setUserList}
                    myUser={personalEmail}
                    filter={searchUsers.toLowerCase()}
                    resendInvite={submitAddUserModal}
                    isOrg={true}
                    // onClick={openDeleteModal}
                    // deleteUser={deleteMembership}
                    // setUserIdToBeDeleted={setUserIdToBeDeleted}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            <div className="bg-white/5 rounded-md px-6 pt-6 pb-6 flex flex-col items-start flex flex-col items-start w-full mb-6 mt-4">
              <div className="flex flex-row max-w-5xl justify-between items-center w-full">
                <div className="flex flex-col justify-between w-full max-w-3xl">
                  <p className="text-xl font-semibold mb-3 min-w-max">
                    Incident Contacts
                  </p>
                  <p className="text-xs text-gray-500 mb-2 min-w-max">
                    These contacts will be notified in the unlikely event of a
                    severe incident.
                  </p>
                </div>
                <div className="mt-4 mb-2 min-w-max flex flex-row items-end justify-end justify-center">
                  <Button
                    text="Add Contact"
                    onButtonPressed={openAddIncidentContactModal}
                    color="mineshaft"
                    size="md"
                    icon={faPlus}
                  />
                </div>
              </div>
              <div className="h-12 w-full max-w-5xl bg-white/5 mt-2 flex items-center rounded-t-md flex flwex-row items-center">
                <FontAwesomeIcon
                  className="bg-white/5 rounded-tl-md py-4 pl-4 pr-2 text-gray-400"
                  icon={faMagnifyingGlass}
                />
                <input
                  className="pl-2 text-gray-400 rounded-tr-md bg-white/5 w-full h-full outline-none"
                  value={searchIncidentContact}
                  onChange={(e) => setSearchIncidentContact(e.target.value)}
                  placeholder={'Search...'}
                />
              </div>
              {incidentContacts?.filter((email) =>
                email.includes(searchIncidentContact)
              ).length > 0 ? (
                incidentContacts
                  .filter((email) => email.includes(searchIncidentContact))
                  .map((contact) => (
                    <div
                      key={guidGenerator()}
                      className="flex flex-row items-center justify-between max-w-5xl px-4 py-3 hover:bg-white/5 border-t border-gray-600 w-full"
                    >
                      <p className="text-gray-300">{contact}</p>
                      <div className="opacity-50 hover:opacity-100 duration-200">
                        <Button
                          onButtonPressed={() =>
                            deleteIncidentContactFully(contact)
                          }
                          color="red"
                          size="icon-sm"
                          icon={faX}
                        />
                      </div>
                    </div>
                  ))
              ) : (
                <div className="w-full flex flex-row justify-center mt-6 max-w-4xl ml-6">
                  <p className="text-gray-400">No incident contacts found.</p>
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
