import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "@app/components/basic/buttons/Button";
import AddProjectMemberDialog from "@app/components/basic/dialog/AddProjectMemberDialog";
import ProjectUsersTable from "@app/components/basic/table/ProjectUsersTable";
import guidGenerator from "@app/components/utilities/randomId";
import { Input } from "@app/components/v2";

import {
  decryptAssymmetric,
  encryptAssymmetric
} from "../../../../components/utilities/cryptography/crypto";
import getOrganizationUsers from "../../../api/organization/GetOrgUsers";
import getUser from "../../../api/user/getUser";
// import DeleteUserDialog from '@app/components/basic/dialog/DeleteUserDialog';
import addUserToWorkspace from "../../../api/workspace/addUserToWorkspace";
import getWorkspaceUsers from "../../../api/workspace/getWorkspaceUsers";
import uploadKeys from "../../../api/workspace/uploadKeys";

interface UserProps {
  firstName: string;
  lastName: string;
  email: string;
  _id: string;
  publicKey: string;
}

interface MembershipProps {
  deniedPermissions: any[];
  user: UserProps;
  inviteEmail: string;
  role: string;
  status: string;
  _id: string;
}

// #TODO: Update all the workspaceIds

export default function Users() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  // let [isDeleteOpen, setIsDeleteOpen] = useState(false);
  // let [userIdToBeDeleted, setUserIdToBeDeleted] = useState(false);
  const [email, setEmail] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [searchUsers, setSearchUsers] = useState("");

  const { t } = useTranslation();

  const router = useRouter();
  const workspaceId = router.query.id as string;

  const [userList, setUserList] = useState<any[]>([]);
  const [isUserListLoading, setIsUserListLoading] = useState(true);
  const [orgUserList, setOrgUserList] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const user = await getUser();
      setPersonalEmail(user.email);

      // This part quiries the current users of a project
      const workspaceUsers = await getWorkspaceUsers({
        workspaceId
      });
      const tempUserList = workspaceUsers.map((membership: MembershipProps) => ({
        key: guidGenerator(),
        firstName: membership.user?.firstName,
        lastName: membership.user?.lastName,
        email: membership.user?.email === null ? membership.inviteEmail : membership.user?.email,
        role: membership?.role,
        status: membership?.status,
        userId: membership.user?._id,
        membershipId: membership._id,
        deniedPermissions: membership.deniedPermissions,
        publicKey: membership.user?.publicKey
      }));
      setUserList(tempUserList);

      setIsUserListLoading(false);

      // This is needed to know wha users from an org (if any), we are able to add to a certain project
      const orgUsers = await getOrganizationUsers({
        orgId: String(localStorage.getItem("orgData.id"))
      });
      setOrgUserList(orgUsers);
      setEmail(
        orgUsers
          ?.filter((membership: MembershipProps) => membership.status === "accepted")
          .map((membership: MembershipProps) => membership.user.email)
          .filter(
            (usEmail: string) =>
              !tempUserList?.map((user1: UserProps) => user1.email).includes(usEmail)
          )[0]
      );
    })();
  }, []);

  const closeAddModal = () => {
    setIsAddOpen(false);
  };

  const openAddModal = () => {
    setIsAddOpen(true);
  };

  // function closeDeleteModal() {
  //   setIsDeleteOpen(false);
  // }

  // function deleteMembership(userId) {
  //   deleteUserFromWorkspace(userId, router.query.id)
  // }

  // function openDeleteModal() {
  //   setIsDeleteOpen(true);
  // }

  const submitAddModal = async () => {
    const result = await addUserToWorkspace(email, workspaceId);
    if (result?.invitee && result?.latestKey) {
      const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;

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

      uploadKeys(workspaceId, result.invitee._id, ciphertext, nonce);
    }
    setEmail("");
    setIsAddOpen(false);
    router.reload();
  };

  return userList ? (
    <div className="flex max-w-7xl mx-auto flex-col justify-start bg-bunker-800 md:h-screen">
      <Head>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex flex-col items-start justify-start px-6 py-6 pb-0 text-3xl mb-4">
        <p className="mr-4 font-semibold text-white">{t("settings.members.title")}</p>
      </div>
      <AddProjectMemberDialog
        isOpen={isAddOpen}
        closeModal={closeAddModal}
        submitModal={submitAddModal}
        email={email}
        data={orgUserList
          ?.filter((membership: MembershipProps) => membership.status === "accepted")
          .map((membership: MembershipProps) => membership.user.email)
          .filter(
            (orgEmail) => !userList?.map((user1: UserProps) => user1.email).includes(orgEmail)
          )}
        setEmail={setEmail}
      />
      {/* <DeleteUserDialog isOpen={isDeleteOpen} closeModal={closeDeleteModal} submitModal={deleteMembership} userIdToBeDeleted={userIdToBeDeleted}/> */}
      <div className="flex w-full flex-row items-start px-6 pb-1">
        <div className="flex w-full max-w-sm flex flex-row ml-auto">
          <Input
            className="h-[2.3rem] bg-mineshaft-800 placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
            placeholder="Search by users..."
            value={searchUsers}
            onChange={(e) => setSearchUsers(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          />
        </div>
        <div className="ml-2 flex min-w-max flex-row items-start justify-start">
          <Button
            text={String(t("section.members.add-member"))}
            onButtonPressed={() => {
              openAddModal();
            }}
            color="mineshaft"
            size="md"
            icon={faPlus}
          />
        </div>
      </div>
      <div className="block overflow-x-auto px-6 pb-6">
        <ProjectUsersTable
          userData={userList}
          changeData={setUserList}
          myUser={personalEmail}
          filter={searchUsers}
          isUserListLoading={isUserListLoading}
          // onClick={openDeleteModal}
          // deleteUser={deleteMembership}
          // setUserIdToBeDeleted={setUserIdToBeDeleted}
        />
      </div>
    </div>
  ) : (
    <div className="relative z-10 mr-auto ml-2 flex h-full w-10/12 flex-col items-center justify-center bg-bunker-800">
      <Image src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
    </div>
  );
}

Users.requireAuth = true;
