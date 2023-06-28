import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faSlack } from "@fortawesome/free-brands-svg-icons";
import { faArrowRight, faCheckCircle, faHandPeace, faMagnifyingGlass, faNetworkWired, faPlug, faPlus, faStar, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import AddProjectMemberDialog from "@app/components/basic/dialog/AddProjectMemberDialog";
import ProjectUsersTable from "@app/components/basic/table/ProjectUsersTable";
import guidGenerator from "@app/components/utilities/randomId";
import { useWorkspace } from "@app/context";
import { Workspace } from "@app/hooks/api/workspace/types";

import onboardingCheck from "~/components/utilities/checks/OnboardingCheck";
import { TabsObject } from "~/components/v2/Tabs";

import {
  decryptAssymmetric,
  encryptAssymmetric
} from "../../components/utilities/cryptography/crypto";
import getOrganizationUsers from "../api/organization/GetOrgUsers";
import getUser from "../api/user/getUser";
import registerUserAction from "../api/userActions/registerUserAction";
// import DeleteUserDialog from '@app/components/basic/dialog/DeleteUserDialog';
import addUserToWorkspace from "../api/workspace/addUserToWorkspace";
import getWorkspaceUsers from "../api/workspace/getWorkspaceUsers";
import uploadKeys from "../api/workspace/uploadKeys";

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

const features = [{
  "_id": 0,
  "name": "Kubernetes Operator",
  "description": "Pull secrets into your Kubernetes containers and automatically redeploy upon secret changes."
}]

type ItemProps = {
  text: string;
  subText: string;
  complete: boolean;
  icon: IconProp;
  time: string;
  userAction?: string;
  link?: string;
};

const learningItem = ({
  text,
  subText,
  complete,
  icon,
  time,
  userAction,
  link
}: ItemProps): JSX.Element => {
  if (link) {
    return (
      <a
        target={`${link.includes("https") ? "_blank" : "_self"}`}
        rel="noopener noreferrer"
        className={`w-full ${complete && "opacity-30 duration-200 hover:opacity-100"}`}
        href={link}
      >
        <div className={`${complete ? "bg-gradient-to-r from-primary-500/70 p-[0.07rem]" : ""} mb-3 rounded-md`}>
          <div
            onKeyDown={() => null}
            role="button"
            tabIndex={0}
            onClick={async () => {
              if (userAction && userAction !== "first_time_secrets_pushed") {
                await registerUserAction({
                  action: userAction
                });
              }
            }}
            className={`group relative flex h-[5.5rem] w-full items-center justify-between overflow-hidden rounded-md border ${complete? "bg-gradient-to-r from-[#0e1f01] to-mineshaft-700 border-mineshaft-900 cursor-default" : "bg-mineshaft-800 hover:bg-mineshaft-700 border-mineshaft-600 shadow-xl cursor-pointer"} duration-200 text-mineshaft-100`}
          >
            <div className="mr-4 flex flex-row items-center">
              <FontAwesomeIcon icon={icon} className="mx-2 w-16 text-4xl" />
              {complete && (
                <div className="absolute left-12 top-10 flex h-7 w-7 items-center justify-center rounded-full bg-bunker-500 p-2 group-hover:bg-mineshaft-700">
                  <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5 text-4xl text-primary" />
                </div>
              )}
              <div className="flex flex-col items-start">
                <div className="mt-0.5 text-xl font-semibold">{text}</div>
                <div className="text-sm font-normal">{subText}</div>
              </div>
            </div>
            <div
              className={`w-32 pr-8 text-right text-sm font-semibold ${complete && "text-primary"}`}
            >
              {complete ? "Complete!" : `About ${time}`}
            </div>
            {/* {complete && <div className="absolute bottom-0 left-0 h-1 w-full bg-primary" />} */}
          </div>
        </div>
      </a>
    );
  }
  return (
    <div
      onKeyDown={() => null}
      role="button"
      tabIndex={0}
      onClick={async () => {
        if (userAction) {
          await registerUserAction({
            action: userAction
          });
        }
      }}
      className="relative my-1.5 flex h-[5.5rem] w-full cursor-pointer items-center justify-between overflow-hidden rounded-md border border-dashed border-bunker-400 bg-bunker-700 py-2 pl-2 pr-6 shadow-xl duration-200 hover:bg-bunker-500"
    >
      <div className="mr-4 flex flex-row items-center">
        <FontAwesomeIcon icon={icon} className="mx-2 w-16 text-4xl" />
        {complete && (
          <div className="absolute left-11 top-10 h-7 w-7 rounded-full bg-bunker-700">
            <FontAwesomeIcon
              icon={faCheckCircle}
              className="absolute left-12 top-16 h-5 w-5 text-4xl text-primary"
            />
          </div>
        )}
        <div className="flex flex-col items-start">
          <div className="mt-0.5 text-xl font-semibold">{text}</div>
          <div className="mt-0.5 text-sm font-normal">{subText}</div>
        </div>
      </div>
      <div className={`w-28 pr-4 text-right text-sm font-semibold ${complete && "text-primary"}`}>
        {complete ? "Complete!" : `About ${time}`}
      </div>
      {complete && <div className="absolute bottom-0 left-0 h-1 w-full bg-primary" />}
    </div>
  );
};

// #TODO: Update all the workspaceIds

export default function Organization() {
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
  const { workspaces, isLoading: isWorkspaceLoading } = useWorkspace();

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
    router.rel
    oad();
  };
  const [hasUserClickedSlack, setHasUserClickedSlack] = useState(false);
  const [hasUserClickedIntro, setHasUserClickedIntro] = useState(false);
  const [hasUserStarred, setHasUserStarred] = useState(false);
  const [hasUserPushedSecrets, setHasUserPushedSecrets] = useState(false);
  const [usersInOrg, setUsersInOrg] = useState(false);

  useEffect(() => {
    onboardingCheck({
      setHasUserClickedIntro,
      setHasUserClickedSlack,
      setHasUserPushedSecrets,
      setHasUserStarred,
      setUsersInOrg
    });
  }, []);

  return userList ? (
    <div className="flex max-w-7xl mx-auto flex-col justify-start bg-bunker-800 md:h-screen">
      <Head>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex flex-col items-start justify-start px-6 py-6 pb-0 text-3xl mb-4">
        <p className="mr-4 font-semibold text-white">Projects</p>
        <div className="mt-4 w-full grid grid-flow-dense gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(256px, 4fr))" }}>
          {workspaces.map(workspace => <div key={workspace._id} className="h-40 w-72 rounded-md bg-mineshaft-800 border border-mineshaft-600 p-4 flex flex-col justify-between">
            <div className="text-lg text-mineshaft-100 mt-0">{workspace.name}</div>
            <div className="text-sm text-mineshaft-300 mt-0 pb-6">{(workspace.environments?.length || 0)} environments</div>
            <Link href="/dashbaord">
              <div className="group cursor-default ml-auto hover:bg-primary-800/20 text-sm text-mineshaft-300 hover:text-mineshaft-200 bg-mineshaft-900 py-2 px-4 rounded-full w-max border border-mineshaft-600 hover:border-primary-500/80">Explore <FontAwesomeIcon icon={faArrowRight} className="pl-1.5 pr-0.5 group-hover:pl-2 group-hover:pr-0 duration-200" /></div>
            </Link>
          </div>)}
        </div>
      </div>
      <div className="flex flex-col items-start justify-start px-6 py-6 pb-0 text-3xl mb-4">
        <p className="mr-4 font-semibold text-white mb-4">Onboarding Guide</p>
        {learningItem({
          text: "Watch a video about Infisical",
          subText: "",
          complete: hasUserClickedIntro,
          icon: faHandPeace,
          time: "3 min",
          userAction: "intro_cta_clicked",
          link: "https://www.youtube.com/watch?v=PK23097-25I"
        })}
        {learningItem({
          text: "Add your secrets",
          subText: "Click to see example secrets, and add your own.",
          complete: hasUserPushedSecrets,
          icon: faPlus,
          time: "1 min",
          userAction: "first_time_secrets_pushed",
          link: `/dashboard/${router.query.id}`
        })}
        <div className="group text-mineshaft-100 relative mb-3 flex h-full w-full cursor-default flex-col items-center justify-between overflow-hidden rounded-md border border-mineshaft-600 bg-bunker-500 pl-2 pr-2 pt-4 pb-2 shadow-xl duration-200">
          <div className="mb-4 flex w-full flex-row items-center pr-4">
            <div className="mr-4 flex w-full flex-row items-center">
              <FontAwesomeIcon icon={faNetworkWired} className="mx-2 w-16 text-4xl" />
              {false && (
                <div className="absolute left-12 top-10 flex h-7 w-7 items-center justify-center rounded-full bg-bunker-500 p-2 group-hover:bg-mineshaft-700">
                  <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5 text-4xl text-green" />
                </div>
              )}
              <div className="flex flex-col items-start pl-0.5">
                <div className="mt-0.5 text-xl font-semibold">Inject secrets locally</div>
                <div className="text-sm font-normal">
                  Replace .env files with a more secure and efficient alternative.
                </div>
              </div>
            </div>
            <div className={`w-28 pr-4 text-right text-sm font-semibold ${false && "text-green"}`}>
              About 2 min
            </div>
          </div>
          <TabsObject />
          {false && <div className="absolute bottom-0 left-0 h-1 w-full bg-green" />}
        </div>
        {learningItem({
          text: "Integrate Infisical with your infrastructure",
          subText: "Connect Infisical to various 3rd party services and platforms.",
          complete: false,
          icon: faPlug,
          time: "15 min",
          link: "https://infisical.com/docs/integrations/overview"
        })}
        {learningItem({
          text: "Invite your teammates",
          subText: "",
          complete: usersInOrg,
          icon: faUserPlus,
          time: "2 min",
          link: `/settings/org/${router.query.id}?invite`
        })}
        {learningItem({
          text: "Join Infisical Slack",
          subText: "Have any questions? Ask us!",
          complete: hasUserClickedSlack,
          icon: faSlack,
          time: "1 min",
          userAction: "slack_cta_clicked",
          link: "https://join.slack.com/t/infisical-users/shared_invite/zt-1wehzfnzn-1aMo5JcGENJiNAC2SD8Jlg"
        })}
        {/* <div className="mt-4 w-full grid grid-flow-dense gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(256px, 4fr))" }}>
          {workspaces.map(workspace => <div key={workspace._id} className="h-40 w-72 rounded-md bg-mineshaft-800 border border-mineshaft-600 p-4 flex flex-col justify-between">
            <div className="text-lg text-mineshaft-100 mt-0">{workspace.name}</div>
            <Link href="/dashbaord">
              <div className="group cursor-default hover:bg-primary-800/20 text-sm text-mineshaft-300 hover:text-mineshaft-200 bg-mineshaft-900 py-2 px-4 rounded-full w-max border border-mineshaft-600 hover:border-primary-500/80">Explore <FontAwesomeIcon icon={faArrowRight} className="pl-1.5 pr-0.5 group-hover:pl-2 group-hover:pr-0 duration-200" /></div>
            </Link>
          </div>)}
        </div> */}
      </div>
      <div className="flex flex-col items-start justify-start px-6 py-6 pb-0 text-3xl mb-4 pb-6">
        <p className="mr-4 font-semibold text-white">Explore More</p>
        <div className="mt-4 w-full grid grid-flow-dense gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(256px, 4fr))" }}>
          {features.map(feature => <div key={feature._id} className="h-44 w-96 rounded-md bg-mineshaft-800 border border-mineshaft-600 p-4 flex flex-col justify-between">
            <div className="text-lg text-mineshaft-100 mt-0">{feature.name}</div>
            <div className="text-[15px] font-light text-mineshaft-300 mb-4 mt-2">{feature.description}</div>
            <div className="w-full flex items-center">
              <div className="text-mineshaft-300 text-[15px] font-light">Setup time: 20 min</div>
              <Link href="/dashbaord">
                <div className="group cursor-default ml-auto hover:bg-primary-800/20 text-sm text-mineshaft-300 hover:text-mineshaft-200 bg-mineshaft-900 py-2 px-4 rounded-full w-max border border-mineshaft-600 hover:border-primary-500/80">Learn more <FontAwesomeIcon icon={faArrowRight} className="pl-1.5 pr-0.5 group-hover:pl-2 group-hover:pr-0 duration-200" /></div>
              </Link>
            </div>
          </div>)}
        </div>
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
      {/* <div className="absolute right-4 top-36 flex w-full flex-row items-start px-6 pb-1">
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
            onButtonPressed={openAddModal}
            color="mineshaft"
            size="md"
            icon={faPlus}
          />
        </div>
      </div> */}
    </div>
  ) : (
    <div className="relative z-10 mr-auto ml-2 flex h-full w-10/12 flex-col items-center justify-center bg-bunker-800">
      <Image src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
    </div>
  );
}

Organization.requireAuth = true;
