
import crypto from "crypto";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faSlack } from "@fortawesome/free-brands-svg-icons";
import { faFolderOpen } from "@fortawesome/free-regular-svg-icons";
import { faArrowRight, faCheckCircle, faHandPeace, faMagnifyingGlass, faNetworkWired, faPlug, faPlus, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import onboardingCheck from "@app/components/utilities/checks/OnboardingCheck";
import { Button, Checkbox, FormControl, Input, Modal, ModalContent, UpgradePlanModal } from "@app/components/v2";
import { TabsObject } from "@app/components/v2/Tabs";
import { useSubscription, useUser, useWorkspace } from "@app/context";
import { fetchOrgUsers, useAddUserToWs, useCreateWorkspace, useUploadWsKey } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { encryptAssymmetric } from "../../../../components/utilities/cryptography/crypto";
import registerUserAction from "../../../api/userActions/registerUserAction";

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

const formSchema = yup.object({
  name: yup.string().required().label("Project Name").trim(),
  addMembers: yup.bool().required().label("Add Members")
});

type TAddProjectFormData = yup.InferType<typeof formSchema>;

// #TODO: Update all the workspaceIds

export default function Organization() {
  const { t } = useTranslation();

  const router = useRouter();

  const { workspaces } = useWorkspace();
  const orgWorkspaces = workspaces?.filter(workspace => workspace.organization === localStorage.getItem("orgData.id")) || []
  const currentOrg = String(router.query.id);
  const { createNotification } = useNotificationContext();
  const addWsUser = useAddUserToWs();
  
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
  const uploadWsKey = useUploadWsKey();

  const onCreateProject = async ({ name, addMembers }: TAddProjectFormData) => {
    // type check
    if (!currentOrg) return;
    try {
      const {
        data: {
          workspace: { _id: newWorkspaceId }
        }
      } = await createWs.mutateAsync({
        organizationId: currentOrg,
        workspaceName: name
      });

      const randomBytes = crypto.randomBytes(16).toString("hex");
      const PRIVATE_KEY = String(localStorage.getItem("PRIVATE_KEY"));
      const { ciphertext, nonce } = encryptAssymmetric({
        plaintext: randomBytes,
        publicKey: user.publicKey,
        privateKey: PRIVATE_KEY
      });

      await uploadWsKey.mutateAsync({
        encryptedKey: ciphertext,
        nonce,
        userId: user?._id,
        workspaceId: newWorkspaceId
      });

      if (addMembers) {
        // not using hooks because need at this point only
        const orgUsers = await fetchOrgUsers(currentOrg);
        orgUsers.forEach(({ status, user: orgUser }) => {
          // skip if status of org user is not accepted
          // this orgUser is the person who created the ws
          if (status !== "accepted" || user.email === orgUser.email) return;
          addWsUser.mutate({ email: orgUser.email, workspaceId: newWorkspaceId });
        });
      }
      createNotification({ text: "Workspace created", type: "success" });
      handlePopUpClose("addNewWs");
      router.push(`/project/${newWorkspaceId}/secrets`);
    } catch (err) {
      console.error(err);
      createNotification({ text: "Failed to create workspace", type: "error" });
    }
  };

  const { subscription } = useSubscription();

  const isAddingProjectsAllowed = subscription?.workspaceLimit ? (subscription.workspacesUsed < subscription.workspaceLimit) : true;

  useEffect(() => {
    onboardingCheck({
      setHasUserClickedIntro,
      setHasUserClickedSlack,
      setHasUserPushedSecrets,
      setUsersInOrg
    });
  }, []);

  return (
    <div className="flex max-w-7xl mx-auto flex-col justify-start bg-bunker-800 md:h-screen">
      <Head>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex flex-col items-start justify-start px-6 py-6 pb-0 text-3xl mb-4">
        <p className="mr-4 font-semibold text-white">Projects {orgWorkspaces.map(ws => ws?.name).join("")}</p>
        <div className="w-full flex flex-row mt-6">
          <Input
            className="h-[2.3rem] text-sm bg-mineshaft-800 placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
            placeholder="Search by project name..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          />
          <Button
            colorSchema="primary"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => {
              if (isAddingProjectsAllowed) {
                handlePopUpOpen("addNewWs")
              } else {
                handlePopUpOpen("upgradePlan");
              }
            }}
            className="ml-2"
          >
            Add New Project
          </Button>
        </div>
        <div className="mt-4 w-full grid gap-4 grid-cols-3 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {orgWorkspaces.filter(ws => ws?.name?.toLowerCase().includes(searchFilter.toLowerCase())).map(workspace => <div key={workspace._id} className="h-32 lg:h-40 min-w-72 rounded-md bg-mineshaft-800 border border-mineshaft-600 p-4 flex flex-col justify-between">
            <div className="text-lg text-mineshaft-100 mt-0">{workspace.name}</div>
            <div className="text-sm text-mineshaft-300 mt-0 lg:pb-6">{(workspace.environments?.length || 0)} environments</div>
            <Link href={`/project/${workspace._id}/secrets`}>
              <div className="group cursor-default ml-auto hover:bg-primary-800/20 text-sm text-mineshaft-300 hover:text-mineshaft-200 bg-mineshaft-900 py-2 px-4 rounded-full w-max border border-mineshaft-600 hover:border-primary-500/80">Explore <FontAwesomeIcon icon={faArrowRight} className="pl-1.5 pr-0.5 group-hover:pl-2 group-hover:pr-0 duration-200" /></div>
            </Link>
          </div>)}
        </div>
        {orgWorkspaces.length === 0 && ( 
          <div className="w-full rounded-md bg-mineshaft-800 border border-mineshaft-700 px-4 py-6 text-mineshaft-300 text-base">
            <FontAwesomeIcon icon={faFolderOpen} className="w-full text-center text-5xl mb-4 mt-2 text-mineshaft-400" />
            <div className="text-center font-light">
              You are not part of any projects in this organization yet. When you are, they will appear
              here.
            </div>
            <div className="mt-0.5 text-center font-light">
              Create a new project, or ask other organization members to give you necessary permissions.
            </div>
          </div>
        )}
      </div>
      {((new Date()).getTime() - (new Date(user?.createdAt)).getTime()) < 30 * 24 * 60 * 60 * 1000 && <div className="flex flex-col items-start justify-start px-6 py-6 pb-0 text-3xl mb-4">
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
        {orgWorkspaces.length !== 0 && learningItem({
          text: "Add your secrets",
          subText: "Click to see example secrets, and add your own.",
          complete: hasUserPushedSecrets,
          icon: faPlus,
          time: "1 min",
          userAction: "first_time_secrets_pushed",
          link: `/project/${orgWorkspaces[0]?._id}/secrets`
        })}
        {orgWorkspaces.length !== 0 && <div className="group text-mineshaft-100 relative mb-3 flex h-full w-full cursor-default flex-col items-center justify-between overflow-hidden rounded-md border border-mineshaft-600 bg-mineshaft-800 pl-2 pr-2 pt-4 pb-2 shadow-xl duration-200">
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
        </div>}
        {orgWorkspaces.length !== 0 && learningItem({
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
          link: `/org/${router.query.id}/members?action=invite`
        })}
        {learningItem({
          text: "Join Infisical Slack",
          subText: "Have any questions? Ask us!",
          complete: hasUserClickedSlack,
          icon: faSlack,
          time: "1 min",
          userAction: "slack_cta_clicked",
          link: "https://join.slack.com/t/infisical-users/shared_invite/zt-1ye0tm8ab-899qZ6ZbpfESuo6TEikyOQ"
        })}
      </div>}
      <div className="flex flex-col items-start justify-start px-6 py-6 pb-0 text-3xl mb-4 pb-6">
        <p className="mr-4 font-semibold text-white">Explore More</p>
        <div className="mt-4 w-full grid grid-flow-dense gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(256px, 4fr))" }}>
          {features.map(feature => <div key={feature._id} className="h-44 w-96 rounded-md bg-mineshaft-800 border border-mineshaft-600 p-4 flex flex-col justify-between">
            <div className="text-lg text-mineshaft-100 mt-0">{feature.name}</div>
            <div className="text-[15px] font-light text-mineshaft-300 mb-4 mt-2">{feature.description}</div>
            <div className="w-full flex items-center">
              <div className="text-mineshaft-300 text-[15px] font-light">Setup time: 20 min</div>
              <a
                target="_blank"
                rel="noopener noreferrer"
                className="group cursor-default ml-auto hover:bg-primary-800/20 text-sm text-mineshaft-300 hover:text-mineshaft-200 bg-mineshaft-900 py-2 px-4 rounded-full w-max border border-mineshaft-600 hover:border-primary-500/80"
                href="https://infisical.com/docs/documentation/getting-started/kubernetes"
              >
                Learn more <FontAwesomeIcon icon={faArrowRight} className="pl-1.5 pr-0.5 group-hover:pl-2 group-hover:pr-0 duration-200"/>
              </a>
            </div>
          </div>)}
        </div>
      </div>
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
                defaultValue
                render={({ field: { onBlur, value, onChange } }) => (
                  <Checkbox
                    id="add-project-layout"
                    isChecked={value}
                    onCheckedChange={onChange}
                    onBlur={onBlur}
                  >
                    Add all members of my organization to this project
                  </Checkbox>
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
}

Organization.requireAuth = true;
