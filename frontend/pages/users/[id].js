import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { faMagnifyingGlass, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '~/components/basic/buttons/Button';
import AddProjectMemberDialog from '~/components/basic/dialog/AddProjectMemberDialog';
import UserTable from '~/components/basic/table/UserTable';
import NavHeader from '~/components/navigation/NavHeader';
import guidGenerator from '~/utilities/randomId';

import getOrganizationUsers from '../api/organization/GetOrgUsers';
import getUser from '../api/user/getUser';
// import DeleteUserDialog from '~/components/basic/dialog/DeleteUserDialog';
import addUserToWorkspace from '../api/workspace/addUserToWorkspace';
import getWorkspaceUsers from '../api/workspace/getWorkspaceUsers';
import uploadKeys from '../api/workspace/uploadKeys';

// #TODO: Update all the workspaceIds
const crypto = require('crypto');
const {
  decryptAssymmetric,
  encryptAssymmetric
} = require('../../components/utilities/cryptography/crypto');
const nacl = require('tweetnacl');
nacl.util = require('tweetnacl-util');

export default function Users() {
  let [isAddOpen, setIsAddOpen] = useState(false);
  // let [isDeleteOpen, setIsDeleteOpen] = useState(false);
  // let [userIdToBeDeleted, setUserIdToBeDeleted] = useState(false);
  let [email, setEmail] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [searchUsers, setSearchUsers] = useState('');

  const router = useRouter();
  let workspaceId;

  function closeAddModal() {
    setIsAddOpen(false);
  }

  // function closeDeleteModal() {
  //   setIsDeleteOpen(false);
  // }

  // function deleteMembership(userId) {
  //   deleteUserFromWorkspace(userId, router.query.id)
  // }

  // function openDeleteModal() {
  //   setIsDeleteOpen(true);
  // }

  async function submitAddModal() {
    let result = await addUserToWorkspace(email, router.query.id);
    if (result?.invitee && result?.latestKey) {
      const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY');

      // assymmetrically decrypt symmetric key with local private key
      const key = decryptAssymmetric({
        ciphertext: result.latestKey.encryptedKey,
        nonce: result.latestKey.nonce,
        publicKey: result.latestKey.sender.publicKey,
        privateKey: PRIVATE_KEY
      });

      const { ciphertext, nonce } = encryptAssymmetric({
        plaintext: key,
        publicKey: result.invitee.publicKey,
        privateKey: PRIVATE_KEY
      });

      uploadKeys(router.query.id, result.invitee._id, ciphertext, nonce);
    }
    setEmail('');
    setIsAddOpen(false);
    router.reload();
  }

  function openAddModal() {
    setIsAddOpen(true);
  }

  const [userList, setUserList] = useState();
  const [orgUserList, setOrgUserList] = useState([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(async () => {
    const user = await getUser();
    setPersonalEmail(user.email);

    workspaceId = router.query.id;
    let workspaceUsers = await getWorkspaceUsers({
      workspaceId
    });
    const tempUserList = workspaceUsers.map((user) => ({
      key: guidGenerator(),
      firstName: user.user?.firstName,
      lastName: user.user?.lastName,
      email: user.user?.email == null ? user.inviteEmail : user.user?.email,
      role: user?.role,
      status: user?.status,
      userId: user.user?._id,
      membershipId: user._id,
      publicKey: user.user?.publicKey
    }));
    setUserList(tempUserList);
    const orgUsers = await getOrganizationUsers({
      orgId: localStorage.getItem('orgData.id')
    });
    setOrgUserList(orgUsers);
    setEmail(
      orgUsers
        ?.filter((user) => user.status == 'accepted')
        .map((user) => user.user.email)
        .filter(
          (email) => !tempUserList?.map((user1) => user1.email).includes(email)
        )[0]
    );
  }, []);

  return userList ? (
    <div className="bg-bunker-800 md:h-screen flex flex-col justify-start">
      <Head>
        <title>Users</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <NavHeader pageName="Project Members" isProjectRelated={true} />
      <div className="flex flex-col justify-start items-start px-6 py-6 pb-4 text-3xl">
        <p className="font-semibold mr-4 text-white">Project Members</p>
        <p className="mr-4 text-base text-gray-400">
          This pages shows the members of the selected project.
        </p>
      </div>
      <AddProjectMemberDialog
        isOpen={isAddOpen}
        closeModal={closeAddModal}
        submitModal={submitAddModal}
        email={email}
        data={orgUserList
          ?.filter((user) => user.status == 'accepted')
          .map((user) => user.user.email)
          .filter(
            (email) => !userList?.map((user1) => user1.email).includes(email)
          )}
        workspaceId={workspaceId}
        setEmail={setEmail}
      />
      {/* <DeleteUserDialog isOpen={isDeleteOpen} closeModal={closeDeleteModal} submitModal={deleteMembership} userIdToBeDeleted={userIdToBeDeleted}/> */}
      <div className="px-2 pb-1 w-full flex flex-row items-start max-w-5xl">
        <div className="h-10 w-full bg-white/5 mt-2 flex items-center rounded-md flex flex-row items-center ml-4">
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
        <div className="mt-2 ml-2 min-w-max flex flex-row items-start justify-start mr-4">
          <Button
            text="Add Member"
            onButtonPressed={openAddModal}
            color="mineshaft"
            size="md"
            icon={faPlus}
          />
        </div>
      </div>
      <div className="overflow-y-auto max-w-5xl mx-6">
        <UserTable
          userData={userList}
          changeData={setUserList}
          myUser={personalEmail}
          filter={searchUsers}
          resendInvite={submitAddModal}
          isOrg={false}
          // onClick={openDeleteModal}
          // deleteUser={deleteMembership}
          // setUserIdToBeDeleted={setUserIdToBeDeleted}
          className="w-full mx-6"
        />
      </div>
    </div>
  ) : (
    <div className="relative z-10 w-10/12 mr-auto h-full ml-2 bg-bunker-800 flex flex-col items-center justify-center">
      <div className="absolute top-0 bg-bunker h-14 border-b border-mineshaft-700 w-full"></div>
      <Image
        src="/images/loading/loading.gif"
        height={70}
        width={120}
        alt="loading animation"
      ></Image>
    </div>
  );
}

Users.requireAuth = true;
