import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { faEye, faEyeSlash, faPenToSquare, faPlus, faX } from '@fortawesome/free-solid-svg-icons';
import { plans } from 'public/data/frequentConstants';

import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import { Select, SelectItem } from '@app/components/v2';
import updateUserProjectPermission from '@app/ee/api/memberships/UpdateUserProjectPermission';
import getOrganizationSubscriptions from '@app/pages/api/organization/GetOrgSubscription';
import changeUserRoleInWorkspace from '@app/pages/api/workspace/changeUserRoleInWorkspace';
import deleteUserFromWorkspace from '@app/pages/api/workspace/deleteUserFromWorkspace';
import getLatestFileKey from '@app/pages/api/workspace/getLatestFileKey';
import getProjectInfo from '@app/pages/api/workspace/getProjectInfo';
import uploadKeys from '@app/pages/api/workspace/uploadKeys';

import { decryptAssymmetric, encryptAssymmetric } from '../../utilities/cryptography/crypto';
import guidGenerator from '../../utilities/randomId';
import Button from '../buttons/Button';
import UpgradePlanModal from '../dialog/UpgradePlan';

// const roles = ['admin', 'user'];
// TODO: Set type for this
type Props = {
  userData: any[];
  changeData: (users: any[]) => void;
  myUser: string;
  filter: string;
};

type EnvironmentProps = {
  name: string;
  slug: string;
};

/**
 * This is the component that shows the users of a certin project
 * #TODO: add the possibility of choosing and doing operations on multiple users.
 * @param {*} props
 * @returns
 */
const ProjectUsersTable = ({ userData, changeData, myUser, filter }: Props) => {
  const [roleSelected, setRoleSelected] = useState(
    Array(userData?.length).fill(userData.map((user) => user.role))
  );
  const host = window.location.origin;
  const router = useRouter();
  const [myRole, setMyRole] = useState('member');
  const [currentPlan, setCurrentPlan] = useState('');
  const [workspaceEnvs, setWorkspaceEnvs] = useState<EnvironmentProps[]>([]);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const { createNotification } = useNotificationContext();

  const workspaceId = router.query.id as string;
  // Delete the row in the table (e.g. a user)
  // #TODO: Add a pop-up that warns you that the user is going to be deleted.
  const handleDelete = (membershipId: string, index: number) => {
    // setUserIdToBeDeleted(userId);
    // onClick();
    deleteUserFromWorkspace(membershipId);
    changeData(userData.filter((v, i) => i !== index));
    setRoleSelected([
      ...roleSelected.slice(0, index),
      ...roleSelected.slice(index + 1, userData?.length)
    ]);
  };

  // Update the rold of a certain user
  const handleRoleUpdate = (index: number, e: string) => {
    changeUserRoleInWorkspace(userData[index].membershipId, e.toLowerCase());
    changeData([
      ...userData.slice(0, index),
      ...[
        {
          key: userData[index].key,
          firstName: userData[index].firstName,
          lastName: userData[index].lastName,
          email: userData[index].email,
          role: e.toLocaleLowerCase(),
          status: userData[index].status,
          userId: userData[index].userId,
          membershipId: userData[index].membershipId,
          publicKey: userData[index].publicKey,
          deniedPermissions: userData[index].deniedPermissions
        }
      ],
      ...userData.slice(index + 1, userData?.length)
    ]);
    createNotification({
      text: `Successfully changed user role.`,
      type: 'success'
    });
  };

  const handlePermissionUpdate = (
    index: number,
    val: string,
    membershipId: string,
    slug: string
  ) => {
    let denials: { ability: string; environmentSlug: string }[];
    if (val === 'Read Only') {
      denials = [
        {
          ability: 'write',
          environmentSlug: slug
        }
      ];
    } else if (val === 'No Access') {
      denials = [
        {
          ability: 'write',
          environmentSlug: slug
        },
        {
          ability: 'read',
          environmentSlug: slug
        }
      ];
    } else if (val === 'Add Only') {
      denials = [
        {
          ability: 'read',
          environmentSlug: slug
        }
      ];
    } else {
      denials = [];
    }

    if (currentPlan !== plans.professional && host === 'https://app.infisical.com' && workspaceId !== '63ea8121b6e2b0543ba79616') {
      setIsUpgradeModalOpen(true);
    } else {
      const allDenials = userData[index].deniedPermissions
        .filter(
          (perm: { ability: string; environmentSlug: string }) => perm.environmentSlug !== slug
        )
        .concat(denials);
      updateUserProjectPermission({ membershipId, denials: allDenials });
      changeData([
        ...userData.slice(0, index),
        ...[
          {
            key: userData[index].key,
            firstName: userData[index].firstName,
            lastName: userData[index].lastName,
            email: userData[index].email,
            role: userData[index].role,
            status: userData[index].status,
            userId: userData[index].userId,
            membershipId: userData[index].membershipId,
            publicKey: userData[index].publicKey,
            deniedPermissions: allDenials
          }
        ],
        ...userData.slice(index + 1, userData?.length)
      ]);
      createNotification({
        text: `Successfully changed user permissions.`,
        type: 'success'
      });
    }
  };

  useEffect(() => {
    setMyRole(userData.filter((user) => user.email === myUser)[0]?.role);
    (async () => {
      const result = await getProjectInfo({ projectId: workspaceId });
      setWorkspaceEnvs(result.environments);

      const orgId = localStorage.getItem('orgData.id') as string;
      const subscriptions = await getOrganizationSubscriptions({
        orgId
      });
      if (subscriptions) {
        setCurrentPlan(subscriptions.data[0].plan.product);
      }
    })();
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

  const closeUpgradeModal = () => {
    setIsUpgradeModalOpen(false);
  };

  return (
    <div className="table-container relative mb-6 mt-1 min-w-max rounded-md border border-mineshaft-700 bg-bunker">
      <div className="absolute h-[3.1rem] w-full rounded-t-md bg-white/5" />
      <UpgradePlanModal
        isOpen={isUpgradeModalOpen}
        onClose={closeUpgradeModal}
        text="You can change user permissions if you switch to Infisical's Professional plan."
      />
      <table className="my-0.5 w-full">
        <thead className="text-xs font-light text-gray-400">
          <tr>
            <th className="py-3.5 pl-4 text-left">NAME</th>
            <th className="py-3.5 pl-4 text-left">EMAIL</th>
            <th className="py-3.5 pl-6 pr-10 text-left">ROLE</th>
            {workspaceEnvs.map((env) => (
              <th key={guidGenerator()} className="max-w-min break-normal py-1 pl-2 text-left">
                <span>
                  {env.slug.toUpperCase()}
                  <br />
                </span>
                {/* <span>PERMISSION</span> */}
              </th>
            ))}
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
                <tr key={guidGenerator()} className="bg-bunker-600 text-sm hover:bg-bunker-500">
                  <td className="border-t border-mineshaft-700 py-2 pl-4 text-gray-300">
                    {row.firstName} {row.lastName}
                  </td>
                  <td className="border-t border-mineshaft-700 py-2 pl-4 text-gray-300">
                    {row.email}
                  </td>
                  <td className="border-t border-mineshaft-700 py-2 pl-6 pr-10 text-gray-300">
                    <div className="flex h-full flex-row items-center justify-start">
                      <Select
                        className="w-36 bg-mineshaft-700"
                        dropdownContainerClassName="bg-mineshaft-700"
                        // open={isOpen}
                        onValueChange={(e) => handleRoleUpdate(index, e)}
                        value={row.role}
                        isDisabled={myRole !== 'admin' || myUser === row.email}
                        // onOpenChange={(open) => setIsOpen(open)}
                      >
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </Select>
                      {row.status === 'completed' && myUser !== row.email && (
                        <div className="rounded-md border border-mineshaft-700 bg-white/5 text-white duration-200 hover:bg-primary hover:text-black">
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
                  {workspaceEnvs.map((env) => (
                    <td
                      key={guidGenerator()}
                      className="border-t border-mineshaft-700 py-2 pl-2 text-gray-300"
                    >
                      <Select
                        className="w-16 bg-mineshaft-700"
                        dropdownContainerClassName="bg-mineshaft-800 border border-mineshaft-600 text-bunker-200"
                        position="item-aligned"
                        // open={isOpen}
                        onValueChange={(val) =>
                          handlePermissionUpdate(index, val, row.membershipId, env.slug)
                        }
                        value={
                          // eslint-disable-next-line no-nested-ternary
                          row.deniedPermissions
                            .filter((perm: any) => perm.environmentSlug === env.slug)
                            .map((perm: { ability: string }) => perm.ability)
                            .includes('write') &&
                          row.deniedPermissions
                            .filter((perm: any) => perm.environmentSlug === env.slug)
                            .map((perm: { ability: string }) => perm.ability)
                            .includes('read')
                            ? 'No Access'
                            : // eslint-disable-next-line no-nested-ternary
                            row.deniedPermissions
                                .filter((perm: any) => perm.environmentSlug === env.slug)
                                .map((perm: { ability: string }) => perm.ability)
                                .includes('write') &&
                              !row.deniedPermissions
                                .filter((perm: any) => perm.environmentSlug === env.slug)
                                .map((perm: { ability: string }) => perm.ability)
                                .includes('read')
                            ? 'Read Only'
                            : !row.deniedPermissions
                                .filter((perm: any) => perm.environmentSlug === env.slug)
                                .map((perm: { ability: string }) => perm.ability)
                                .includes('write') &&
                              row.deniedPermissions
                                .filter((perm: any) => perm.environmentSlug === env.slug)
                                .map((perm: { ability: string }) => perm.ability)
                                .includes('read')
                            ? 'Add Only'
                            : 'Read & Write'
                        }
                        icon={
                          // eslint-disable-next-line no-nested-ternary
                          row.deniedPermissions
                            .filter((perm: any) => perm.environmentSlug === env.slug)
                            .map((perm: { ability: string }) => perm.ability)
                            .includes('write') &&
                          row.deniedPermissions
                            .filter((perm: any) => perm.environmentSlug === env.slug)
                            .map((perm: { ability: string }) => perm.ability)
                            .includes('read')
                            ? faEyeSlash
                            : // eslint-disable-next-line no-nested-ternary
                            row.deniedPermissions
                                .filter((perm: any) => perm.environmentSlug === env.slug)
                                .map((perm: { ability: string }) => perm.ability)
                                .includes('write') &&
                              !row.deniedPermissions
                                .filter((perm: any) => perm.environmentSlug === env.slug)
                                .map((perm: { ability: string }) => perm.ability)
                                .includes('read')
                            ? faEye
                            : !row.deniedPermissions
                                .filter((perm: any) => perm.environmentSlug === env.slug)
                                .map((perm: { ability: string }) => perm.ability)
                                .includes('write') &&
                              row.deniedPermissions
                                .filter((perm: any) => perm.environmentSlug === env.slug)
                                .map((perm: { ability: string }) => perm.ability)
                                .includes('read')
                            ? faPlus
                            : faPenToSquare
                        }
                        isDisabled={myRole !== 'admin'}
                        // onOpenChange={(open) => setIsOpen(open)}
                      >
                        <SelectItem value="No Access" customIcon={faEyeSlash}>
                          No Access
                        </SelectItem>
                        <SelectItem value="Read Only" customIcon={faEye}>
                          Read Only
                        </SelectItem>
                        <SelectItem value="Add Only" customIcon={faPlus}>
                          Add Only
                        </SelectItem>
                        <SelectItem value="Read & Write" customIcon={faPenToSquare}>
                          Read & Write
                        </SelectItem>
                      </Select>
                    </td>
                  ))}
                  <td className="border-0.5 flex flex-row justify-end border-t border-mineshaft-700 py-2 pl-8 pr-8">
                    {myUser !== row.email &&
                    // row.role !== "admin" &&
                    myRole !== 'member' ? (
                      <div className="mt-0.5 flex items-center opacity-50 hover:opacity-100">
                        <Button
                          onButtonPressed={() => handleDelete(row.membershipId, index)}
                          color="red"
                          size="icon-sm"
                          icon={faX}
                        />
                      </div>
                    ) : (
                      <div className="h-9 w-9" />
                    )}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProjectUsersTable;
