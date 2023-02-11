import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { faX } from '@fortawesome/free-solid-svg-icons';

import changeUserRoleInOrganization from '@app/pages/api/organization/changeUserRoleInOrganization';
import deleteUserFromOrganization from '@app/pages/api/organization/deleteUserFromOrganization';
import deleteUserFromWorkspace from '@app/pages/api/workspace/deleteUserFromWorkspace';
import getLatestFileKey from '@app/pages/api/workspace/getLatestFileKey';
import uploadKeys from '@app/pages/api/workspace/uploadKeys';

import { decryptAssymmetric, encryptAssymmetric } from '../../utilities/cryptography/crypto';
import guidGenerator from '../../utilities/randomId';
import Button from '../buttons/Button';
import Listbox from '../Listbox';

// const roles = ['admin', 'user'];
// TODO: Set type for this
type Props = {
  userData: any[];
  changeData: (users: any[]) => void;
  myUser: string;
  filter: string;
  resendInvite: (email: string) => void;
  isOrg: boolean;
};

/**
 * This is the component that we utilize for the user table - in future, can reuse it for some other purposes too.
 * #TODO: add the possibility of choosing and doing operations on multiple users.
 * @param {*} props
 * @returns
 */
const UserTable = ({ userData, changeData, myUser, filter, resendInvite, isOrg }: Props) => {
  const [roleSelected, setRoleSelected] = useState(
    Array(userData?.length).fill(userData.map((user) => user.role))
  );
  const router = useRouter();
  const [myRole, setMyRole] = useState('member');

  const workspaceId = router.query.id as string;
  // Delete the row in the table (e.g. a user)
  // #TODO: Add a pop-up that warns you that the user is going to be deleted.
  const handleDelete = (membershipId: string, index: number) => {
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

  // Update the role of a certain user
  const handleRoleUpdate = (index: number, e: string) => {
    changeUserRoleInOrganization(String(localStorage.getItem("orgData.id")), userData[index].membershipId, e);
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
    setMyRole(userData.filter((user) => user.email === myUser)[0]?.role);
  }, [userData, myUser]);

  const grantAccess = async (id: string, publicKey: string) => {
    const result = await getLatestFileKey({ workspaceId });

    const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY') as string;

    // assymmetrically decrypt symmetric key with local private key
    const key = decryptAssymmetric({
      ciphertext: result.latestKey.encryptedKey,
      nonce: result.latestKey.nonce,
      publicKey: result.latestKey.sender.publicKey,
      privateKey: PRIVATE_KEY
    });

    const { ciphertext, nonce } = encryptAssymmetric({
      plaintext: key,
      publicKey,
      privateKey: PRIVATE_KEY
    });

    uploadKeys(workspaceId, id, ciphertext, nonce);
    router.reload();
  };

  const deleteMembershipAndResendInvite = (email: string) => {
    // deleteUserFromWorkspace(membershipId);
    resendInvite(email);
  };

  return (
    <div className="table-container bg-bunker rounded-md mb-6 border border-mineshaft-700 relative mt-1 min-w-max">
      <div className="absolute rounded-t-md w-full h-[3.25rem] bg-white/5" />
      <table className="w-full my-0.5">
        <thead className="text-gray-400 text-sm font-light">
          <tr>
            <th className="text-left pl-4 py-3.5">NAME</th>
            <th className="text-left pl-4 py-3.5">EMAIL</th>
            <th className="text-left pl-6 pr-10 py-3.5">ROLE</th>
            <th aria-label="buttons" />
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
              .map((row, index) => (
                <tr key={guidGenerator()} className="bg-bunker-800 hover:bg-bunker-700">
                  <td className="pl-4 py-2 border-mineshaft-700 border-t text-gray-300">
                    {row.firstName} {row.lastName}
                  </td>
                  <td className="pl-4 py-2 border-mineshaft-700 border-t text-gray-300">
                    {row.email}
                  </td>
                  <td className="pl-6 pr-10 py-2 border-mineshaft-700 border-t text-gray-300">
                    <div className="justify-start h-full flex flex-row items-center">
                      {row.status === 'accepted' &&
                      ((myRole === 'admin' && row.role !== 'owner') || myRole === 'owner') &&
                      (myUser !== row.email) ? (
                        <Listbox
                          isSelected={row.role}
                          onChange={(e) => handleRoleUpdate(index, e)}
                          data={
                            myRole === 'owner' ? ['owner', 'admin', 'member'] : ['admin', 'member']
                          }
                        />
                      ) : (
                        row.status !== 'invited' &&
                        row.status !== 'verified' && (
                          <Listbox
                            isSelected={row.role}
                            onChange={() => {
                              throw new Error('Function not implemented.');
                            }}
                            data={null}
                          />
                        )
                      )}
                      {(row.status === 'invited' || row.status === 'verified') && (
                        <div className="w-full pr-20">
                          <Button
                            onButtonPressed={() => deleteMembershipAndResendInvite(row.email)}
                            color="mineshaft"
                            text="Resend Invite"
                            size="md"
                          />
                        </div>
                      )}
                      {row.status === 'completed' && myUser !== row.email && (
                        <div className="border border-mineshaft-700 rounded-md bg-white/5 hover:bg-primary text-white hover:text-black duration-200">
                          <Button
                            onButtonPressed={() => grantAccess(row.userId, row.publicKey)}
                            color="mineshaft"
                            text="Grant Access"
                            size="md"
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="flex flex-row justify-end pl-8 pr-8 py-2 border-t border-0.5 border-mineshaft-700">
                    {myUser !== row.email &&
                    // row.role !== "admin" &&
                    myRole !== 'member' ? (
                      <div className="opacity-50 hover:opacity-100 flex items-center mt-0.5">
                        <Button
                          onButtonPressed={() => handleDelete(row.membershipId, index)}
                          color="red"
                          size="icon-sm"
                          icon={faX}
                        />
                      </div>
                    ) : (
                      <div className="w-9 h-9" />
                    )}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
};

export default UserTable;
