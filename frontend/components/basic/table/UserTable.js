import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { faX } from '@fortawesome/free-solid-svg-icons';

import deleteUserFromOrganization from '~/pages/api/organization/deleteUserFromOrganization';
import changeUserRoleInWorkspace from '~/pages/api/workspace/changeUserRoleInWorkspace';
import deleteUserFromWorkspace from '~/pages/api/workspace/deleteUserFromWorkspace';
import getLatestFileKey from '~/pages/api/workspace/getLatestFileKey';
import uploadKeys from '~/pages/api/workspace/uploadKeys';

import guidGenerator from '../../utilities/randomId';
import Button from '../buttons/Button';
import Listbox from '../Listbox';

const {
  decryptAssymmetric,
  encryptAssymmetric
} = require('../../utilities/cryptography/crypto');
const nacl = require('tweetnacl');
nacl.util = require('tweetnacl-util');

const roles = ['admin', 'user'];

/**
 * This is the component that we utilize for the user table - in future, can reuse it for some other purposes too.
 * #TODO: add the possibility of choosing and doing operations on multiple users.
 * @param {*} props
 * @returns
 */
const UserTable = ({
  userData,
  changeData,
  myUser,
  filter,
  resendInvite,
  isOrg,
  onClick,
  deleteUser,
  setUserIdToBeDeleted
}) => {
  const [roleSelected, setRoleSelected] = useState(
    Array(userData?.length).fill(userData.map((user) => user.role))
  );
  const router = useRouter();
  const [myRole, setMyRole] = useState('member');

  // Delete the row in the table (e.g. a user)
  // #TODO: Add a pop-up that warns you that the user is going to be deleted.
  const handleDelete = (membershipId, index, e) => {
    // setUserIdToBeDeleted(userId);
    // onClick();
    if (isOrg) {
      deleteUserFromOrganization(membershipId);
    } else {
      deleteUserFromWorkspace(membershipId);
    }
    changeData(userData.filter((v, i) => i !== index));
    setRoleSelected([
      ...roleSelected.slice(0, index),
      ...roleSelected.slice(index + 1, userData?.length)
    ]);
  };

  // Update the rold of a certain user
  const handleRoleUpdate = (index, e) => {
    changeUserRoleInWorkspace(userData[index].membershipId, e);
    changeData([
      ...userData.slice(0, index),
      ...[
        {
          key: userData[index].key,
          firstName: userData[index].firstName,
          lastName: userData[index].lastName,
          email: userData[index].email,
          role: e,
          status: userData[index].status,
          userId: userData[index].userId,
          membershipId: userData[index].membershipId,
          publicKey: userData[index].publicKey
        }
      ],
      ...userData.slice(index + 1, userData?.length)
    ]);
  };

  useEffect(() => {
    setMyRole(userData.filter((user) => user.email == myUser)[0]?.role);
  }, [userData, myUser]);

  const grantAccess = async (id, publicKey) => {
    let result = await getLatestFileKey({ workspaceId: router.query.id });

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
      publicKey: publicKey,
      privateKey: PRIVATE_KEY
    });

    uploadKeys(router.query.id, id, ciphertext, nonce);
    router.reload();
  };

  const deleteMembershipAndResendInvite = (email, membershipId) => {
    // deleteUserFromWorkspace(membershipId);
    resendInvite(email);
  };

  return (
    <div className="table-container bg-bunker rounded-md mb-6 border border-mineshaft-700 relative mt-1">
      <div className="absolute rounded-t-md w-full h-14 bg-white/5"></div>
      <table className="w-full my-1">
        <thead className="text-gray-400">
          <tr>
            <th className="text-left pl-6 py-3.5">First Name</th>
            <th className="text-left pl-6 py-3.5">Last Name</th>
            <th className="text-left pl-6 py-3.5">Email</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {userData?.filter(
            (user) =>
              user.firstName?.toLowerCase().includes(filter) ||
              user.lastName?.toLowerCase().includes(filter) ||
              user.email?.toLowerCase().includes(filter)
          ).length > 0 &&
            userData
              ?.filter(
                (user) =>
                  user.firstName?.toLowerCase().includes(filter) ||
                  user.lastName?.toLowerCase().includes(filter) ||
                  user.email?.toLowerCase().includes(filter)
              )
              .map((row, index) => {
                return (
                  <tr
                    key={guidGenerator()}
                    className="bg-bunker-800 hover:bg-bunker-800/5"
                  >
                    <td className="pl-6 py-2 border-mineshaft-700 border-t text-gray-300">
                      {row.firstName}
                    </td>
                    <td className="pl-6 py-2 border-mineshaft-700 border-t text-gray-300">
                      {row.lastName}
                    </td>
                    <td className="pl-6 py-2 border-mineshaft-700 border-t text-gray-300">
                      {row.email}
                    </td>
                    <td className="flex flex-row justify-end pr-8 py-2 border-t border-0.5 border-mineshaft-700">
                      <div className="flex justify-end mr-6 w-3/4 mx-2 w-full h-full flex flex-row items-center">
                        {row.status == 'granted' &&
                        ((myRole == 'admin' && row.role != 'owner') ||
                          myRole == 'owner') &&
                        myUser !== row.email ? (
                          <Listbox
                            selected={row.role}
                            onChange={(e) => handleRoleUpdate(index, e)}
                            data={
                              myRole == 'owner'
                                ? ['owner', 'admin', 'member']
                                : ['admin', 'member']
                            }
                            text="Role: "
                            membershipId={row.membershipId}
                          />
                        ) : (
                          row.status != 'invited' &&
                          row.status != 'verified' && (
                            <Listbox
                              selected={row.role}
                              text="Role: "
                              membershipId={row.membershipId}
                            />
                          )
                        )}
                        {(row.status == 'invited' ||
                          row.status == 'verified') && (
                          <div className="w-full pl-9">
                            <Button
                              onButtonPressed={() =>
                                deleteMembershipAndResendInvite(
                                  row.email,
                                  row.membershipId
                                )
                              }
                              color="mineshaft"
                              text="Resend Invite"
                              size="md"
                            />
                          </div>
                        )}
                        {row.status == 'completed' && myUser !== row.email && (
                          <div className="border border-mineshaft-700 rounded-md bg-white/5 hover:bg-primary text-white hover:text-black duration-200">
                            <Button
                              onButtonPressed={() =>
                                grantAccess(row.userId, row.publicKey)
                              }
                              color="mineshaft"
                              text="Grant Access"
                              size="md"
                            />
                          </div>
                        )}
                      </div>
                      {myUser !== row.email &&
                      // row.role != "admin" &&
                      myRole != 'member' ? (
                        <div className="opacity-50 hover:opacity-100 flex items-center">
                          <Button
                            onButtonPressed={(e) =>
                              handleDelete(row.membershipId, index, e)
                            }
                            color="red"
                            size="icon-sm"
                            icon={faX}
                          />
                        </div>
                      ) : (
                        <div className="w-9 h-9"></div>
                      )}
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
};

export default UserTable;
