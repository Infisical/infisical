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
import { useOrganization } from "@app/context";
import { 
  useAddUserToWorkspace,
  useGetOrgUsers,
  useGetUser, 
  useGetWorkspaceUsers} from "@app/hooks/api";
import { uploadWsKey } from "@app/hooks/api/keys/queries";

import {
  decryptAssymmetric,
  encryptAssymmetric
} from "../../../../components/utilities/cryptography/crypto";

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
  const router = useRouter();
  const workspaceId = router.query.id as string;
  
  const { data: user } = useGetUser();
  const { currentOrg } = useOrganization();
  const { data: orgUsers } = useGetOrgUsers(currentOrg?._id ?? "");
  
  const { data: workspaceUsers } = useGetWorkspaceUsers(workspaceId);
  const { mutateAsync: addUserToWorkspaceMutateAsync } = useAddUserToWorkspace();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  // let [isDeleteOpen, setIsDeleteOpen] = useState(false);
  // let [userIdToBeDeleted, setUserIdToBeDeleted] = useState(false);
  const [email, setEmail] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [searchUsers, setSearchUsers] = useState("");

  const { t } = useTranslation();


  const [userList, setUserList] = useState<any[]>([]);
  const [isUserListLoading, setIsUserListLoading] = useState(true);
  const [orgUserList, setOrgUserList] = useState<any[]>([]);

  useEffect(() => {
    if (user && workspaceUsers && orgUsers) {
      (async () => {
        setPersonalEmail(user.email);
        
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
    }
  }, [user, workspaceUsers, orgUsers]);

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
    const result = await addUserToWorkspaceMutateAsync({
      email,
      workspaceId
    });
    
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

      await uploadWsKey({
        workspaceId,
        userId: result.invitee._id,
        encryptedKey: ciphertext,
        nonce
      });
    }
    setEmail("");
    setIsAddOpen(false);
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
