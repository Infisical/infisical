// REFACTOR(akhilmhdh): This file needs to be split into multiple components too complex

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faSlack } from "@fortawesome/free-brands-svg-icons";
import { faFolderOpen } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowRight,
  faArrowUpRightFromSquare,
  faCheck,
  faCheckCircle,
  faClipboard,
  faExclamationCircle,
  faHandPeace,
  faMagnifyingGlass,
  faNetworkWired,
  faPlug,
  faPlus,
  faUserPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Tabs from "@radix-ui/react-tabs";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import onboardingCheck from "@app/components/utilities/checks/OnboardingCheck";
import {
  Button,
  Checkbox,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Skeleton,
  UpgradePlanModal
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useSubscription,
  useUser,
  useWorkspace
} from "@app/context";
import { withPermission } from "@app/hoc";
import {
  // fetchOrgUsers,
  // useAddUserToWs,
  useCreateWorkspace,
  useRegisterUserAction,
} from "@app/hooks/api";
// import { fetchUserWsKey } from "@app/hooks/api/keys/queries";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { usePopUp } from "@app/hooks/usePopUp";

const features = [
  {
    id: 0,
    name: "Kubernetes Operator",
    link: "https://infisical.com/docs/documentation/getting-started/kubernetes",
    description:
      "Pull secrets into your Kubernetes containers and automatically redeploy upon secret changes."
  },
  {
    _id: 1,
    name: "Infisical Agent",
    link: "https://infisical.com/docs/infisical-agent/overview",
    description: "Inject secrets into your apps without modifying any application logic."
  }
];

type ItemProps = {
  text: string;
  subText: string;
  complete: boolean;
  icon: IconProp;
  time: string;
  userAction?: string;
  link?: string;
};

function copyToClipboard(id: string, setState: (value: boolean) => void) {
  // Get the text field
  const copyText = document.getElementById(id) as HTMLInputElement;

  // Select the text field
  copyText.select();
  copyText.setSelectionRange(0, 99999); // For mobile devices

  // Copy the text inside the text field
  navigator.clipboard.writeText(copyText.value);

  setState(true);
  setTimeout(() => setState(false), 2000);
  // Alert the copied text
  // alert("Copied the text: " + copyText.value);
}

const CodeItem = ({
  isCopied,
  setIsCopied,
  textExplanation,
  code,
  id
}: {
  isCopied: boolean;
  setIsCopied: (value: boolean) => void;
  textExplanation: string;
  code: string;
  id: string;
}) => {
  return (
    <>
      <p className="mb-2 mt-4 text-sm leading-normal text-bunker-300">{textExplanation}</p>
      <div className="flex flex-row items-center justify-between rounded-md border border-mineshaft-600 bg-bunker px-3 py-2 font-mono text-sm">
        <input disabled value={code} id={id} className="w-full bg-transparent text-bunker-200" />
        <button
          type="button"
          onClick={() => copyToClipboard(id, setIsCopied)}
          className="h-full pl-3.5 pr-2 text-bunker-300 duration-200 hover:text-primary-200"
        >
          {isCopied ? (
            <FontAwesomeIcon icon={faCheck} className="pr-0.5" />
          ) : (
            <FontAwesomeIcon icon={faClipboard} />
          )}
        </button>
      </div>
    </>
  );
};

const TabsObject = () => {
  const [downloadCodeCopied, setDownloadCodeCopied] = useState(false);
  const [downloadCode2Copied, setDownloadCode2Copied] = useState(false);
  const [loginCodeCopied, setLoginCodeCopied] = useState(false);
  const [initCodeCopied, setInitCodeCopied] = useState(false);
  const [runCodeCopied, setRunCodeCopied] = useState(false);

  return (
    <Tabs.Root
      className="flex w-full cursor-default flex-col rounded-md border border-mineshaft-600"
      defaultValue="tab1"
    >
      <Tabs.List
        className="flex shrink-0 border-b border-mineshaft-600"
        aria-label="Manage your account"
      >
        <Tabs.Trigger
          className="flex h-10 flex-1 cursor-default select-none items-center justify-center bg-bunker-700 px-5 text-sm leading-none text-bunker-300 outline-none first:rounded-tl-md last:rounded-tr-md data-[state=active]:border-b data-[state=active]:border-primary data-[state=active]:font-medium data-[state=active]:text-primary data-[state=active]:focus:relative"
          value="tab1"
        >
          MacOS
        </Tabs.Trigger>
        <Tabs.Trigger
          className="flex h-10 flex-1 cursor-default select-none items-center justify-center bg-bunker-700 px-5 text-sm leading-none text-bunker-300 outline-none first:rounded-tl-md last:rounded-tr-md data-[state=active]:border-b data-[state=active]:border-primary data-[state=active]:font-medium data-[state=active]:text-primary data-[state=active]:focus:relative"
          value="tab2"
        >
          Windows
        </Tabs.Trigger>
        {/* <Tabs.Trigger
        className="bg-bunker-700 px-5 h-10 flex-1 flex items-center justify-center text-sm leading-none text-bunker-300 select-none first:rounded-tl-md last:rounded-tr-md data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:focus:relative data-[state=active]:border-b data-[state=active]:border-primary outline-none cursor-default"
        value="tab3"
      >
        Arch Linux
      </Tabs.Trigger> */}
        <a
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 flex-1 cursor-default select-none items-center justify-center bg-bunker-700 px-5 text-sm leading-none text-bunker-300 outline-none duration-200 first:rounded-tl-md last:rounded-tr-md hover:text-bunker-100 data-[state=active]:border-b data-[state=active]:border-primary data-[state=active]:font-medium data-[state=active]:text-primary data-[state=active]:focus:relative"
          href="https://infisical.com/docs/cli/overview"
        >
          Other Platforms <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="ml-2" />
        </a>
      </Tabs.List>
      <Tabs.Content
        className="grow cursor-default rounded-b-md bg-bunker-700 p-5 pt-0 outline-none"
        value="tab1"
      >
        <CodeItem
          isCopied={downloadCodeCopied}
          setIsCopied={setDownloadCodeCopied}
          textExplanation="1. Download CLI"
          code="brew install infisical/get-cli/infisical"
          id="downloadCode"
        />
        <CodeItem
          isCopied={loginCodeCopied}
          setIsCopied={setLoginCodeCopied}
          textExplanation="2. Login"
          code="infisical login"
          id="loginCode"
        />
        <CodeItem
          isCopied={initCodeCopied}
          setIsCopied={setInitCodeCopied}
          textExplanation="3. Choose Project"
          code="infisical init"
          id="initCode"
        />
        <CodeItem
          isCopied={runCodeCopied}
          setIsCopied={setRunCodeCopied}
          textExplanation="4. Done! Now, you can prepend your usual start script with:"
          code="infisical run -- [YOUR USUAL CODE START SCRIPT GOES HERE]"
          id="runCode"
        />
        <p className="mt-2 text-sm text-bunker-300">
          You can find example of start commands for different frameworks{" "}
          <a
            className="text-primary underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
            href="https://infisical.com/docs/integrations/overview"
          >
            here
          </a>
          .{" "}
        </p>
      </Tabs.Content>
      <Tabs.Content className="grow rounded-b-md bg-bunker-700 p-5 pt-0 outline-none" value="tab2">
        <CodeItem
          isCopied={downloadCodeCopied}
          setIsCopied={setDownloadCodeCopied}
          textExplanation="1. Download CLI"
          code="scoop bucket add org https://github.com/Infisical/scoop-infisical.git"
          id="downloadCodeW"
        />
        <div className="mt-2 flex flex-row items-center justify-between rounded-md border border-mineshaft-600 bg-bunker px-3 py-2 font-mono text-sm">
          <input
            disabled
            value="scoop install infisical"
            id="downloadCodeW2"
            className="w-full bg-transparent text-bunker-200"
          />
          <button
            type="button"
            onClick={() => copyToClipboard("downloadCodeW2", setDownloadCode2Copied)}
            className="h-full pl-3.5 pr-2 text-bunker-300 duration-200 hover:text-primary-200"
          >
            {downloadCode2Copied ? (
              <FontAwesomeIcon icon={faCheck} className="pr-0.5" />
            ) : (
              <FontAwesomeIcon icon={faClipboard} />
            )}
          </button>
        </div>
        <CodeItem
          isCopied={loginCodeCopied}
          setIsCopied={setLoginCodeCopied}
          textExplanation="2. Login"
          code="infisical login"
          id="loginCodeW"
        />
        <CodeItem
          isCopied={initCodeCopied}
          setIsCopied={setInitCodeCopied}
          textExplanation="3. Choose Project"
          code="infisical init"
          id="initCodeW"
        />
        <CodeItem
          isCopied={runCodeCopied}
          setIsCopied={setRunCodeCopied}
          textExplanation="4. Done! Now, you can prepend your usual start script with:"
          code="infisical run -- [YOUR USUAL CODE START SCRIPT GOES HERE]"
          id="runCodeW"
        />
        <p className="mt-2 text-sm text-bunker-300">
          You can find example of start commands for different frameworks{" "}
          <a
            className="text-primary underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
            href="https://infisical.com/docs/integrations/overview"
          >
            here
          </a>
          .{" "}
        </p>
      </Tabs.Content>
    </Tabs.Root>
  );
};

const LearningItem = ({
  text,
  subText,
  complete,
  icon,
  time,
  userAction,
  link
}: ItemProps): JSX.Element => {
  const registerUserAction = useRegisterUserAction();
  if (link) {
    return (
      <a
        target={`${link.includes("https") ? "_blank" : "_self"}`}
        rel="noopener noreferrer"
        className={`w-full ${complete && "opacity-30 duration-200 hover:opacity-100"}`}
        href={link}
      >
        <div
          className={`${
            complete ? "bg-gradient-to-r from-primary-500/70 p-[0.07rem]" : ""
          } mb-3 rounded-md`}
        >
          <div
            onKeyDown={() => null}
            role="button"
            tabIndex={0}
            onClick={async () => {
              if (userAction && userAction !== "first_time_secrets_pushed") {
                await registerUserAction.mutateAsync(userAction);
              }
            }}
            className={`group relative flex h-[5.5rem] w-full items-center justify-between overflow-hidden rounded-md border ${
              complete
                ? "cursor-default border-mineshaft-900 bg-gradient-to-r from-[#0e1f01] to-mineshaft-700"
                : "cursor-pointer border-mineshaft-600 bg-mineshaft-800 shadow-xl hover:bg-mineshaft-700"
            } text-mineshaft-100 duration-200`}
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
          await registerUserAction.mutateAsync(userAction);
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

const LearningItemSquare = ({
  text,
  subText,
  complete,
  icon,
  time,
  userAction,
  link
}: ItemProps): JSX.Element => {
  const registerUserAction = useRegisterUserAction();
  return (
    <a
      target={`${link?.includes("https") ? "_blank" : "_self"}`}
      rel="noopener noreferrer"
      className={`w-full ${complete && "opacity-30 duration-200 hover:opacity-100"}`}
      href={link}
    >
      <div
        className={`${
          complete ? "bg-gradient-to-r from-primary-500/70 p-[0.07rem]" : ""
        } w-full rounded-md`}
      >
        <div
          onKeyDown={() => null}
          role="button"
          tabIndex={0}
          onClick={async () => {
            if (userAction && userAction !== "first_time_secrets_pushed") {
              await registerUserAction.mutateAsync(userAction);
            }
          }}
          className={`group relative flex w-full items-center justify-between overflow-hidden rounded-md border ${
            complete
              ? "cursor-default border-mineshaft-900 bg-gradient-to-r from-[#0e1f01] to-mineshaft-700"
              : "cursor-pointer border-mineshaft-600 bg-mineshaft-800 shadow-xl hover:bg-mineshaft-700"
          } text-mineshaft-100 duration-200`}
        >
          <div className="flex w-full flex-col items-center px-6 py-4">
            <div className="flex w-full flex-row items-start justify-between">
              <FontAwesomeIcon
                icon={icon}
                className="w-16 pt-2 text-5xl text-mineshaft-200 duration-100 group-hover:text-mineshaft-100"
              />
              {complete && (
                <div className="absolute left-14 top-12 flex h-7 w-7 items-center justify-center rounded-full bg-bunker-500 p-2 group-hover:bg-mineshaft-700">
                  <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5 text-4xl text-primary" />
                </div>
              )}
              <div
                className={`text-right text-sm font-normal text-mineshaft-300 ${
                  complete ? "font-semibold text-primary" : ""
                }`}
              >
                {complete ? "Complete!" : `About ${time}`}
              </div>
            </div>
            <div className="flex w-full flex-col items-start justify-start pt-4">
              <div className="mt-0.5 text-lg font-medium">{text}</div>
              <div className="text-sm font-normal text-mineshaft-300">{subText}</div>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
};

const formSchema = yup.object({
  name: yup.string().required().label("Project Name").trim(),
  addMembers: yup.bool().required().label("Add Members")
});

type TAddProjectFormData = yup.InferType<typeof formSchema>;

// #TODO: Update all the workspaceIds

const OrganizationPage = withPermission(
  () => {
    const { t } = useTranslation();

    const router = useRouter();

    const { workspaces, isLoading: isWorkspaceLoading } = useWorkspace();
    const currentOrg = String(router.query.id);
    const orgWorkspaces = workspaces?.filter((workspace) => workspace.orgId === currentOrg) || [];
    const { createNotification } = useNotificationContext();
   // const addWsUser = useAddUserToWs();

    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "addNewWs",
      "upgradePlan"
    ] as const);
    const {
      control,
      formState: { isSubmitting },
      reset,
      handleSubmit
    } = useForm<TAddProjectFormData>({
      resolver: yupResolver(formSchema)
    });

    const [hasUserClickedSlack, setHasUserClickedSlack] = useState(false);
    const [hasUserClickedIntro, setHasUserClickedIntro] = useState(false);
    const [hasUserPushedSecrets, setHasUserPushedSecrets] = useState(false);
    const [usersInOrg, setUsersInOrg] = useState(false);
    const [searchFilter, setSearchFilter] = useState("");
    const createWs = useCreateWorkspace();
    const { user } = useUser();
    const { data: serverDetails } = useFetchServerStatus();

    const onCreateProject = async ({ name, addMembers }: TAddProjectFormData) => {
      // type check
      if (!currentOrg) return;
      try {
        const {
          data: {
            workspace: { id: newWorkspaceId }
          }
        } = await createWs.mutateAsync({
          organizationId: currentOrg,
          inviteAllOrgMembers: addMembers,
          projectName: name
        });

        /*
        if (addMembers) {
          // not using hooks because need at this point only
          const orgUsers = await fetchOrgUsers(currentOrg);
          const decryptKey = await fetchUserWsKey(newWorkspaceId);

          await addWsUser.mutateAsync({
            workspaceId: newWorkspaceId,
            decryptKey,
            userPrivateKey: PRIVATE_KEY,
            members: orgUsers
              .filter(
                ({ status, user: orgUser }) => status === "accepted" && user.email !== orgUser.email
              )
              .map(({ user: orgUser, id: orgMembershipId }) => ({
                userPublicKey: orgUser.publicKey,
                orgMembershipId
              }))
          });
        }
        */
        createNotification({ text: "Workspace created", type: "success" });
        handlePopUpClose("addNewWs");
        router.push(`/project/${newWorkspaceId}/secrets/overview`);
      } catch (err) {
        console.error(err);
        createNotification({ text: "Failed to create workspace", type: "error" });
      }
    };

    const { subscription } = useSubscription();

    const isAddingProjectsAllowed = subscription?.workspaceLimit
      ? subscription.workspacesUsed < subscription.workspaceLimit
      : true;

    useEffect(() => {
      onboardingCheck({
        orgId: currentOrg,
        setHasUserClickedIntro,
        setHasUserClickedSlack,
        setHasUserPushedSecrets,
        setUsersInOrg
      });
    }, []);

    const isWorkspaceEmpty = !isWorkspaceLoading && orgWorkspaces?.length === 0;

    return (
      <div className="mx-auto flex max-w-7xl flex-col justify-start bg-bunker-800 md:h-screen">
        <Head>
          <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
          <link rel="icon" href="/infisical.ico" />
        </Head>
        {!serverDetails?.redisConfigured && (
          <div className="mb-4 flex flex-col items-start justify-start px-6 py-6 pb-0 text-3xl">
            <p className="mr-4 mb-4 font-semibold text-white">Announcements</p>
            <div className="flex w-full items-center rounded-md border border-blue-400/70 bg-blue-900/70 p-2 text-base text-mineshaft-100">
              <FontAwesomeIcon
                icon={faExclamationCircle}
                className="mr-4 p-4 text-2xl text-mineshaft-50"
              />
              Attention: Updated versions of Infisical now require Redis for full functionality.
              Learn how to configure it
              <Link
                href="https://infisical.com/docs/self-hosting/configuration/redis"
                target="_blank"
              >
                <span className="cursor-pointer pl-1 text-white underline underline-offset-2 duration-100 hover:text-blue-200 hover:decoration-blue-400">
                  here
                </span>
              </Link>
              .
            </div>
          </div>
        )}
        <div className="mb-4 flex flex-col items-start justify-start px-6 py-6 pb-0 text-3xl">
          <p className="mr-4 font-semibold text-white">Projects</p>
          <div className="mt-6 flex w-full flex-row">
            <Input
              className="h-[2.3rem] bg-mineshaft-800 text-sm placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
              placeholder="Search by project name..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            />
            <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Workspace}>
              {(isAllowed) => (
                <Button
                  isDisabled={!isAllowed}
                  colorSchema="primary"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => {
                    if (isAddingProjectsAllowed) {
                      handlePopUpOpen("addNewWs");
                    } else {
                      handlePopUpOpen("upgradePlan");
                    }
                  }}
                  className="ml-2"
                >
                  Add New Project
                </Button>
              )}
            </OrgPermissionCan>
          </div>
          <div className="mt-4 grid w-full grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {isWorkspaceLoading &&
              Array.apply(0, Array(3)).map((_x, i) => (
                <div
                  key={`workspace-cards-loading-${i + 1}`}
                  className="min-w-72 flex h-40 flex-col justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4"
                >
                  <div className="mt-0 text-lg text-mineshaft-100">
                    <Skeleton className="w-3/4 bg-mineshaft-600" />
                  </div>
                  <div className="mt-0 pb-6 text-sm text-mineshaft-300">
                    <Skeleton className="w-1/2 bg-mineshaft-600" />
                  </div>
                  <div className="flex justify-end">
                    <Skeleton className="w-1/2 bg-mineshaft-600" />
                  </div>
                </div>
              ))}
            {orgWorkspaces
              .filter((ws) => ws?.name?.toLowerCase().includes(searchFilter.toLowerCase()))
              .map((workspace) => (
                <div
                  key={workspace.id}
                  className="min-w-72 flex h-40 flex-col justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4"
                >
                  <div className="mt-0 text-lg text-mineshaft-100">{workspace.name}</div>
                  <div className="mt-0 pb-6 text-sm text-mineshaft-300">
                    {workspace.environments?.length || 0} environments
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      router.push(`/project/${workspace.id}/secrets/overview`);
                      localStorage.setItem("projectData.id", workspace.id);
                    }}
                  >
                    <div className="group ml-auto w-max cursor-pointer rounded-full border border-mineshaft-600 bg-mineshaft-900 py-2 px-4 text-sm text-mineshaft-300 hover:border-primary-500/80 hover:bg-primary-800/20 hover:text-mineshaft-200">
                      Explore{" "}
                      <FontAwesomeIcon
                        icon={faArrowRight}
                        className="pl-1.5 pr-0.5 duration-200 group-hover:pl-2 group-hover:pr-0"
                      />
                    </div>
                  </button>
                </div>
              ))}
          </div>
          {isWorkspaceEmpty && (
            <div className="w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
              <FontAwesomeIcon
                icon={faFolderOpen}
                className="mb-4 mt-2 w-full text-center text-5xl text-mineshaft-400"
              />
              <div className="text-center font-light">
                You are not part of any projects in this organization yet. When you are, they will
                appear here.
              </div>
              <div className="mt-0.5 text-center font-light">
                Create a new project, or ask other organization members to give you necessary
                permissions.
              </div>
            </div>
          )}
        </div>
        <div className="mb-4 flex flex-col items-start justify-start px-6 py-6 pb-6 text-3xl">
          <p className="mr-4 font-semibold text-white">Explore Infisical</p>
          <div className="mt-4 grid w-full grid-cols-3 gap-4">
            {features.map((feature) => (
              <div
                key={feature._id}
                className="flex h-44 w-full flex-col justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4"
              >
                <div className="mt-0 text-lg text-mineshaft-100">{feature.name}</div>
                <div className="mb-4 mt-2 text-[15px] font-light text-mineshaft-300">
                  {feature.description}
                </div>
                <div className="flex w-full items-center">
                  <div className="text-[15px] font-light text-mineshaft-300">
                    Setup time: 20 min
                  </div>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group ml-auto w-max cursor-default rounded-full border border-mineshaft-600 bg-mineshaft-900 py-2 px-4 text-sm text-mineshaft-300 hover:border-primary-500/80 hover:bg-primary-800/20 hover:text-mineshaft-200"
                    href={feature.link}
                  >
                    Learn more{" "}
                    <FontAwesomeIcon
                      icon={faArrowRight}
                      className="pl-1.5 pr-0.5 duration-200 group-hover:pl-2 group-hover:pr-0"
                    />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
        {!(
          new Date().getTime() - new Date(user?.createdAt).getTime() <
          30 * 24 * 60 * 60 * 1000
        ) && (
          <div className="mb-4 flex flex-col items-start justify-start px-6 pb-0 text-3xl">
            <p className="mr-4 mb-4 font-semibold text-white">Onboarding Guide</p>
            <div className="mb-3 grid w-full grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <LearningItemSquare
                text="Watch Infisical demo"
                subText="Set up Infisical in 3 min."
                complete={hasUserClickedIntro}
                icon={faHandPeace}
                time="3 min"
                userAction="intro_cta_clicked"
                link="https://www.youtube.com/watch?v=PK23097-25I"
              />
              {orgWorkspaces.length !== 0 && (
                <>
                  <LearningItemSquare
                    text="Add your secrets"
                    subText="Drop a .env file or type your secrets."
                    complete={hasUserPushedSecrets}
                    icon={faPlus}
                    time="1 min"
                    userAction="first_time_secrets_pushed"
                    link={`/project/${orgWorkspaces[0]?.id}/secrets/overview`}
                  />
                  <LearningItemSquare
                    text="Invite your teammates"
                    subText="Infisical is better used as a team."
                    complete={usersInOrg}
                    icon={faUserPlus}
                    time="2 min"
                    link={`/org/${router.query.id}/members?action=invite`}
                  />
                </>
              )}
              <div className="block xl:hidden 2xl:block">
                <LearningItemSquare
                  text="Join Infisical Slack"
                  subText="Have any questions? Ask us!"
                  complete={hasUserClickedSlack}
                  icon={faSlack}
                  time="1 min"
                  userAction="slack_cta_clicked"
                  link="https://infisical.com/slack"
                />
              </div>
            </div>
            {orgWorkspaces.length !== 0 && (
              <div className="group relative mb-3 flex h-full w-full cursor-default flex-col items-center justify-between overflow-hidden rounded-md border border-mineshaft-600 bg-mineshaft-800 pl-2 pr-2 pt-4 pb-2 text-mineshaft-100 shadow-xl duration-200">
                <div className="mb-4 flex w-full flex-row items-center pr-4">
                  <div className="mr-4 flex w-full flex-row items-center">
                    <FontAwesomeIcon icon={faNetworkWired} className="mx-2 w-16 text-4xl" />
                    {false && (
                      <div className="absolute left-12 top-10 flex h-7 w-7 items-center justify-center rounded-full bg-bunker-500 p-2 group-hover:bg-mineshaft-700">
                        <FontAwesomeIcon
                          icon={faCheckCircle}
                          className="h-5 w-5 text-4xl text-green"
                        />
                      </div>
                    )}
                    <div className="flex flex-col items-start pl-0.5">
                      <div className="mt-0.5 text-xl font-semibold">Inject secrets locally</div>
                      <div className="text-sm font-normal">
                        Replace .env files with a more secure and efficient alternative.
                      </div>
                    </div>
                  </div>
                  <div
                    className={`w-28 pr-4 text-right text-sm font-semibold ${
                      false && "text-green"
                    }`}
                  >
                    About 2 min
                  </div>
                </div>
                <TabsObject />
                {false && <div className="absolute bottom-0 left-0 h-1 w-full bg-green" />}
              </div>
            )}
            {orgWorkspaces.length !== 0 && (
              <LearningItem
                text="Integrate Infisical with your infrastructure"
                subText="Connect Infisical to various 3rd party services and platforms."
                complete={false}
                icon={faPlug}
                time="15 min"
                link="https://infisical.com/docs/integrations/overview"
              />
            )}
          </div>
        )}
        <Modal
          isOpen={popUp.addNewWs.isOpen}
          onOpenChange={(isModalOpen) => {
            handlePopUpToggle("addNewWs", isModalOpen);
            reset();
          }}
        >
          <ModalContent
            title="Create a new project"
            subTitle="This project will contain your secrets and configurations."
          >
            <form onSubmit={handleSubmit(onCreateProject)}>
              <Controller
                control={control}
                name="name"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Project Name"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="Type your project name" />
                  </FormControl>
                )}
              />
              <div className="mt-4 pl-1">
                <Controller
                  control={control}
                  name="addMembers"
                  defaultValue={false}
                  render={({ field: { onBlur, value, onChange } }) => (
                    <OrgPermissionCan
                      I={OrgPermissionActions.Read}
                      a={OrgPermissionSubjects.Member}
                    >
                      {(isAllowed) => (
                        <div>
                          <Checkbox
                            id="add-project-layout"
                            isChecked={value}
                            onCheckedChange={onChange}
                            isDisabled={!isAllowed}
                            onBlur={onBlur}
                          >
                            Add all members of my organization to this project
                          </Checkbox>
                        </div>
                      )}
                    </OrgPermissionCan>
                  )}
                />
              </div>
              <div className="mt-7 flex items-center">
                <Button
                  isDisabled={isSubmitting}
                  isLoading={isSubmitting}
                  key="layout-create-project-submit"
                  className="mr-4"
                  type="submit"
                >
                  Create Project
                </Button>
                <Button
                  key="layout-cancel-create-project"
                  onClick={() => handlePopUpClose("addNewWs")}
                  variant="plain"
                  colorSchema="secondary"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </ModalContent>
        </Modal>
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="You have exceeded the number of projects allowed on the free plan."
        />
        {/* <DeleteUserDialog isOpen={isDeleteOpen} closeModal={closeDeleteModal} submitModal={deleteMembership} userIdToBeDeleted={userIdToBeDeleted}/> */}
      </div>
    );
  },
  {
    action: OrgPermissionActions.Read,
    subject: OrgPermissionSubjects.Workspace
  }
);

Object.assign(OrganizationPage, { requireAuth: true });

export default OrganizationPage;
