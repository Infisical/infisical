/* eslint-disable no-nested-ternary */
/* eslint-disable no-unexpected-multiline */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable vars-on-top */
/* eslint-disable no-var */
/* eslint-disable func-names */
import crypto from "crypto";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faGithub, faSlack } from "@fortawesome/free-brands-svg-icons";
import {
  faAngleDown,
  faArrowLeft,
  faArrowUpRightFromSquare,
  faBook,
  faCheck,
  faEnvelope,
  faInfinity,
  faInfo,
  faMobile,
  faPlus,
  faQuestion
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import { tempLocalStorage } from "@app/components/utilities/checks/tempLocalStorage";
import { encryptAssymmetric } from "@app/components/utilities/cryptography/crypto";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  FormControl,
  Input,
  Menu,
  MenuItem,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  UpgradePlanModal
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription,
  useUser,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  fetchOrgUsers,
  useAddUserToWsE2EE,
  useCreateWorkspace,
  useGetOrgTrialUrl,
  useGetSecretApprovalRequestCount,
  useGetUserAction,
  useLogoutUser,
  useRegisterUserAction,
  useUploadWsKey
} from "@app/hooks/api";
import { fetchUserWsKey } from "@app/hooks/api/keys/queries";
import { CreateOrgModal } from "@app/views/Org/components";

interface LayoutProps {
  children: React.ReactNode;
}

const supportOptions = [
  [
    <FontAwesomeIcon key={1} className="pr-4 text-sm" icon={faSlack} />,
    "Support Forum",
    "https://infisical.com/slack"
  ],
  [
    <FontAwesomeIcon key={2} className="pr-4 text-sm" icon={faBook} />,
    "Read Docs",
    "https://infisical.com/docs/documentation/getting-started/introduction"
  ],
  [
    <FontAwesomeIcon key={3} className="pr-4 text-sm" icon={faGithub} />,
    "GitHub Issues",
    "https://github.com/Infisical/infisical/issues"
  ],
  [
    <FontAwesomeIcon key={4} className="pr-4 text-sm" icon={faEnvelope} />,
    "Email Support",
    "mailto:support@infisical.com"
  ]
];

const formSchema = yup.object({
  name: yup.string().required().label("Project Name").trim(),
  addMembers: yup.bool().required().label("Add Members")
});

type TAddProjectFormData = yup.InferType<typeof formSchema>;

export const AppLayout = ({ children }: LayoutProps) => {
  const router = useRouter();
  const { createNotification } = useNotificationContext();
  const { mutateAsync } = useGetOrgTrialUrl();

  // eslint-disable-next-line prefer-const
  const { workspaces, currentWorkspace } = useWorkspace();
  const { orgs, currentOrg } = useOrganization();

  const { user } = useUser();
  const { subscription } = useSubscription();
  const workspaceId = currentWorkspace?.id || "";
  const { data: updateClosed } = useGetUserAction("december_update_closed");

  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({ workspaceId });

  const isAddingProjectsAllowed = subscription?.workspaceLimit
    ? subscription.workspacesUsed < subscription.workspaceLimit
    : true;

  const createWs = useCreateWorkspace();
  const uploadWsKey = useUploadWsKey();
  const addWsUser = useAddUserToWsE2EE();
  const infisicalPlatformVersion = process.env.NEXT_PUBLIC_INFISICAL_PLATFORM_VERSION;

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addNewWs",
    "upgradePlan",
    "createOrg"
  ] as const);
  const {
    control,
    formState: { isSubmitting },
    reset,
    handleSubmit
  } = useForm<TAddProjectFormData>({
    resolver: yupResolver(formSchema)
  });

  const { t } = useTranslation();

  const registerUserAction = useRegisterUserAction();

  const closeUpdate = async () => {
    await registerUserAction.mutateAsync("december_update_closed");
  };

  const logout = useLogoutUser();
  const logOutUser = async () => {
    try {
      console.log("Logging out...");
      await logout.mutateAsync();
      router.push("/login");
    } catch (error) {
      console.error(error);
    }
  };

  const changeOrg = async (orgId: string) => {
    localStorage.setItem("orgData.id", orgId);
    router.push(`/org/${orgId}/overview`);
  };

  // TODO(akhilmhdh): This entire logic will be rechecked and will try to avoid
  // Placing the localstorage as much as possible
  // Wait till tony integrates the azure and its launched
  useEffect(() => {
    // Put a user in an org if they're not in one yet
    const putUserInOrg = async () => {
      if (tempLocalStorage("orgData.id") === "" && orgs?.[0]?.id) {
        localStorage.setItem("orgData.id", orgs?.[0]?.id);
      }

      if (
        currentOrg &&
        ((workspaces?.length === 0 && router.asPath.includes("project")) ||
          router.asPath.includes("/project/undefined") ||
          (!orgs?.map((org) => org.id)?.includes(router.query.id as string) &&
            !router.asPath.includes("project") &&
            !router.asPath.includes("personal") &&
            !router.asPath.includes("integration")))
      ) {
        router.push(`/org/${currentOrg?.id}/overview`);
      }
      // else if (!router.asPath.includes("org") && !router.asPath.includes("project") && !router.asPath.includes("integrations") && !router.asPath.includes("personal-settings")) {

      //   const pathSegments = router.asPath.split("/").filter((segment) => segment.length > 0);

      //   let intendedWorkspaceId;
      //   if (pathSegments.length >= 2 && pathSegments[0] === "dashboard") {
      //     [, intendedWorkspaceId] = pathSegments;
      //   } else if (pathSegments.length >= 3 && pathSegments[0] === "settings") {
      //     [, , intendedWorkspaceId] = pathSegments;
      //   } else {
      //     const lastPathSegments = router.asPath.split("/").pop();
      //     if (lastPathSegments !== undefined) {
      //       [intendedWorkspaceId] = lastPathSegments.split("?");
      //     }
      //   }

      //   if (!intendedWorkspaceId) return;

      //   if (!["callback", "create", "authorize"].includes(intendedWorkspaceId)) {
      //     localStorage.setItem("projectData.id", intendedWorkspaceId);
      //   }
      // }
    };
    putUserInOrg();
  }, [router.query.id]);

  const onCreateProject = async ({ name, addMembers }: TAddProjectFormData) => {
    // type check
    if (!currentOrg?.id) return;
    try {
      const {
        data: {
          project: { id: newWorkspaceId }
        }
      } = await createWs.mutateAsync({
        organizationId: currentOrg?.id,
        projectName: name
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
        userId: user?.id,
        workspaceId: newWorkspaceId
      });

      if (addMembers) {
        // not using hooks because need at this point only
        const orgUsers = await fetchOrgUsers(currentOrg.id);
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
      createNotification({ text: "Workspace created", type: "success" });
      handlePopUpClose("addNewWs");
      router.push(`/project/${newWorkspaceId}/secrets/overview`);
    } catch (err) {
      console.error(err);
      createNotification({ text: "Failed to create workspace", type: "error" });
    }
  };
  
  return (
    <>
      <div className="dark hidden h-screen w-full flex-col overflow-x-hidden md:flex">
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <aside className="dark w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60">
            <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
              <div>
                {!router.asPath.includes("personal") && (
                  <div className="flex h-12 cursor-default items-center px-3 pt-6">
                    {(router.asPath.includes("project") ||
                      router.asPath.includes("integrations")) && (
                      <Link href={`/org/${currentOrg?.id}/overview`}>
                        <div className="pl-1 pr-2 text-mineshaft-400 duration-200 hover:text-mineshaft-100">
                          <FontAwesomeIcon icon={faArrowLeft} />
                        </div>
                      </Link>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild className="data-[state=open]:bg-mineshaft-600">
                        <div className="mr-auto flex items-center rounded-md py-1.5 pl-1.5 pr-2 hover:bg-mineshaft-600">
                          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-sm">
                            {currentOrg?.name.charAt(0)}
                          </div>
                          <div
                            className="overflow-hidden text-ellipsis pl-2 text-sm text-mineshaft-100"
                            style={{ maxWidth: "140px" }}
                          >
                            {currentOrg?.name}
                          </div>
                          <FontAwesomeIcon
                            icon={faAngleDown}
                            className="pl-1 pt-1 text-xs text-mineshaft-300"
                          />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="p-1">
                        <div className="px-2 py-1 text-xs text-mineshaft-400">{user?.email}</div>
                        {orgs?.map((org) => { 
                          return (
                          <DropdownMenuItem key={org.id}>
                            <Button
                              onClick={async () => {
                                if (currentOrg?.id === org.id) return;
                                
                                if (org.authEnforced) {
                                  // org has an org-level auth method enabled (e.g. SAML)
                                  // -> logout + redirect to SAML SSO

                                  await logout.mutateAsync();
                                  window.open(`/api/v1/sso/redirect/saml2/organizations/${org.slug}`);
                                  window.close();
                                  return;
                                }
                                
                                changeOrg(org?.id)
                              }}
                              variant="plain"
                              colorSchema="secondary"
                              size="xs"
                              className="flex w-full items-center justify-start p-0 font-normal"
                              leftIcon={
                                currentOrg?.id === org.id && (
                                  <FontAwesomeIcon icon={faCheck} className="mr-3 text-primary" />
                                )
                              }
                            >
                              <div className="flex w-full items-center justify-between">
                                {org.name}
                              </div>
                            </Button>
                          </DropdownMenuItem>
                         )
                        })}
                        {/* <DropdownMenuItem key="add-org">
                          <Button
                            onClick={() => handlePopUpOpen("createOrg")}
                            variant="plain"
                            colorSchema="secondary"
                            size="xs"
                            className="flex w-full items-center justify-start p-0 font-normal"
                            leftIcon={
                              <FontAwesomeIcon icon={faPlus} className="mr-3 text-primary" />
                            }
                          >
                            <div className="flex w-full items-center justify-between">
                              Create New Organization
                            </div>
                          </Button>
                        </DropdownMenuItem> */}
                        <div className="mt-1 h-1 border-t border-mineshaft-600" />
                        <button type="button" onClick={logOutUser} className="w-full">
                          <DropdownMenuItem>Log Out</DropdownMenuItem>
                        </button>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        asChild
                        className="p-1 hover:bg-primary-400 hover:text-black data-[state=open]:bg-primary-400 data-[state=open]:text-black"
                      >
                        <div
                          className="child flex items-center justify-center rounded-full bg-mineshaft pr-1 text-mineshaft-300 hover:bg-mineshaft-500"
                          style={{ fontSize: "11px", width: "26px", height: "26px" }}
                        >
                          {user?.firstName?.charAt(0)}
                          {user?.lastName && user?.lastName?.charAt(0)}
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="p-1">
                        <div className="px-2 py-1 text-xs text-mineshaft-400">{user?.email}</div>
                        <Link href="/personal-settings">
                          <DropdownMenuItem>Personal Settings</DropdownMenuItem>
                        </Link>
                        <a
                          href="https://infisical.com/docs/documentation/getting-started/introduction"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 w-full text-sm font-normal leading-[1.2rem] text-mineshaft-300 hover:text-mineshaft-100"
                        >
                          <DropdownMenuItem>
                            Documentation
                            <FontAwesomeIcon
                              icon={faArrowUpRightFromSquare}
                              className="mb-[0.06rem] pl-1.5 text-xxs"
                            />
                          </DropdownMenuItem>
                        </a>
                        <a
                          href="https://infisical.com/slack"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 w-full text-sm font-normal leading-[1.2rem] text-mineshaft-300 hover:text-mineshaft-100"
                        >
                          <DropdownMenuItem>
                            Join Slack Community
                            <FontAwesomeIcon
                              icon={faArrowUpRightFromSquare}
                              className="mb-[0.06rem] pl-1.5 text-xxs"
                            />
                          </DropdownMenuItem>
                        </a>
                        {user?.superAdmin && (
                          <Link href="/admin" legacyBehavior>
                            <DropdownMenuItem className="mt-1 border-t border-mineshaft-600">
                              Admin Panel
                            </DropdownMenuItem>
                          </Link>
                        )}
                        <div className="mt-1 h-1 border-t border-mineshaft-600" />
                        <button type="button" onClick={logOutUser} className="w-full">
                          <DropdownMenuItem>Log Out</DropdownMenuItem>
                        </button>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                {!router.asPath.includes("org") &&
                  (!router.asPath.includes("personal") && currentWorkspace ? (
                    <div className="mt-5 mb-4 w-full p-3">
                      <p className="ml-1.5 mb-1 text-xs font-semibold uppercase text-gray-400">
                        Project
                      </p>
                      <Select
                        defaultValue={currentWorkspace?.id}
                        value={currentWorkspace?.id}
                        className="w-full truncate bg-mineshaft-600 py-2.5 font-medium"
                        onValueChange={(value) => {
                          router.push(`/project/${value}/secrets/overview`);
                          localStorage.setItem("projectData.id", value);
                        }}
                        position="popper"
                        dropdownContainerClassName="text-bunker-200 bg-mineshaft-800 border border-mineshaft-600 z-50 max-h-96 border-gray-700"
                      >
                        <div className="no-scrollbar::-webkit-scrollbar h-full no-scrollbar">
                          {workspaces
                            .filter((ws) => ws.orgId === currentOrg?.id)
                            .map(({ id, name }) => (
                              <SelectItem
                                key={`ws-layout-list-${id}`}
                                value={id}
                                className={`${currentWorkspace?.id === id && "bg-mineshaft-600"}`}
                              >
                                {name}
                              </SelectItem>
                            ))}
                        </div>
                        <hr className="mt-1 mb-1 h-px border-0 bg-gray-700" />
                        <div className="w-full">
                          <OrgPermissionCan
                            I={OrgPermissionActions.Create}
                            a={OrgPermissionSubjects.Workspace}
                          >
                            {(isAllowed) => (
                              <Button
                                className="w-full bg-mineshaft-700 py-2 text-bunker-200"
                                colorSchema="primary"
                                variant="outline_bg"
                                size="sm"
                                isDisabled={!isAllowed}
                                onClick={() => {
                                  if (isAddingProjectsAllowed) {
                                    handlePopUpOpen("addNewWs");
                                  } else {
                                    handlePopUpOpen("upgradePlan");
                                  }
                                }}
                                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                              >
                                Add Project
                              </Button>
                            )}
                          </OrgPermissionCan>
                        </div>
                      </Select>
                    </div>
                  ) : (
                    <Link href={`/org/${currentOrg?.id}/overview`}>
                      <div className="my-6 flex cursor-default items-center justify-center pr-2 text-sm text-mineshaft-300 hover:text-mineshaft-100">
                        <FontAwesomeIcon icon={faArrowLeft} className="pr-3" />
                        Back to organization
                      </div>
                    </Link>
                  ))}
                <div className={`px-1 ${!router.asPath.includes("personal") ? "block" : "hidden"}`}>
                  {(router.asPath.includes("project") || router.asPath.includes("integrations")) &&
                  currentWorkspace ? (
                    <Menu>
                      <Link href={`/project/${currentWorkspace?.id}/secrets/overview`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath.includes(
                              `/project/${currentWorkspace?.id}/secrets`
                            )}
                            icon="system-outline-90-lock-closed"
                          >
                            {t("nav.menu.secrets")}
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/project/${currentWorkspace?.id}/members`} passHref>
                        <a>
                          <MenuItem
                            isSelected={
                              router.asPath === `/project/${currentWorkspace?.id}/members`
                            }
                            icon="system-outline-96-groups"
                          >
                            Access Control
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/integrations/${currentWorkspace?.id}`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath.includes("/integrations")}
                            icon="system-outline-82-extension"
                          >
                            {t("nav.menu.integrations")}
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/project/${currentWorkspace?.id}/secret-rotation`} passHref>
                        <a className="relative">
                          <MenuItem
                            isSelected={
                              router.asPath === `/project/${currentWorkspace?.id}/secret-rotation`
                            }
                            icon="rotation"
                          >
                            Secret Rotation
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/project/${currentWorkspace?.id}/approval`} passHref>
                        <a className="relative">
                          <MenuItem
                            isSelected={
                              router.asPath === `/project/${currentWorkspace?.id}/approval`
                            }
                            icon="system-outline-189-domain-verification"
                          >
                            Secret Approvals
                            {Boolean(secretApprovalReqCount?.open) && (
                              <span className="ml-2 rounded border border-primary-400 bg-primary-600 py-0.5 px-1 text-xs font-semibold text-black">
                                {secretApprovalReqCount?.open}
                              </span>
                            )}
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/project/${currentWorkspace?.id}/audit-logs`} passHref>
                        <a>
                          <MenuItem
                            isSelected={
                              router.asPath === `/project/${currentWorkspace?.id}/audit-logs`
                            }
                            icon="system-outline-168-view-headline"
                          >
                            Audit Logs
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/project/${currentWorkspace?.id}/settings`} passHref>
                        <a>
                          <MenuItem
                            isSelected={
                              router.asPath === `/project/${currentWorkspace?.id}/settings`
                            }
                            icon="system-outline-109-slider-toggle-settings"
                          >
                            {t("nav.menu.project-settings")}
                          </MenuItem>
                        </a>
                      </Link>
                    </Menu>
                  ) : (
                    <Menu className="mt-4">
                      <Link href={`/org/${currentOrg?.id}/overview`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath.includes("/overview")}
                            icon="system-outline-165-view-carousel"
                          >
                            Overview
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/org/${currentOrg?.id}/members`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath === `/org/${currentOrg?.id}/members`}
                            icon="system-outline-96-groups"
                          >
                            Access Control
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/org/${currentOrg?.id}/secret-scanning`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath === `/org/${currentOrg?.id}/secret-scanning`}
                            icon="system-outline-69-document-scan"
                          >
                            Secret Scanning
                          </MenuItem>
                        </a>
                      </Link>
                      {(window.location.origin.includes("https://app.infisical.com")) && (
                        <Link href={`/org/${currentOrg?.id}/billing`} passHref>
                          <a>
                            <MenuItem
                              isSelected={router.asPath === `/org/${currentOrg?.id}/billing`}
                              icon="system-outline-103-coin-cash-monetization"
                            >
                              Usage & Billing
                            </MenuItem>
                          </a>
                        </Link>
                      )}
                      <Link href={`/org/${currentOrg?.id}/settings`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath === `/org/${currentOrg?.id}/settings`}
                            icon="system-outline-109-slider-toggle-settings"
                          >
                            Organization Settings
                          </MenuItem>
                        </a>
                      </Link>
                    </Menu>
                  )}
                </div>
              </div>
              <div
                className={`relative mt-10 ${
                  subscription && subscription.slug === "starter" && !subscription.has_used_trial
                    ? "mb-2"
                    : "mb-4"
                } flex w-full cursor-default flex-col items-center px-3 text-sm text-mineshaft-400`}
              >
                {/* <div className={`${isLearningNoteOpen ? "block" : "hidden"} z-0 absolute h-60 w-[9.9rem] ${router.asPath.includes("org") ? "bottom-[8.4rem]" : "bottom-[5.4rem]"} bg-mineshaft-900 border border-mineshaft-600 mb-4 rounded-md opacity-30`}/>
                <div className={`${isLearningNoteOpen ? "block" : "hidden"} z-0 absolute h-60 w-[10.7rem] ${router.asPath.includes("org") ? "bottom-[8.15rem]" : "bottom-[5.15rem]"} bg-mineshaft-900 border border-mineshaft-600 mb-4 rounded-md opacity-50`}/>
                <div className={`${isLearningNoteOpen ? "block" : "hidden"} z-0 absolute h-60 w-[11.5rem] ${router.asPath.includes("org") ? "bottom-[7.9rem]" : "bottom-[4.9rem]"} bg-mineshaft-900 border border-mineshaft-600 mb-4 rounded-md opacity-70`}/>
                <div className={`${isLearningNoteOpen ? "block" : "hidden"} z-0 absolute h-60 w-[12.3rem] ${router.asPath.includes("org") ? "bottom-[7.65rem]" : "bottom-[4.65rem]"} bg-mineshaft-900 border border-mineshaft-600 mb-4 rounded-md opacity-90`}/> */}
                <div
                  className={`${
                    !updateClosed ? "block" : "hidden"
                  } relative z-10 mb-6 flex h-64 w-52 flex-col items-center justify-start rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3`}
                >
                  <div className="text-md mt-2 w-full font-semibold text-mineshaft-100">
                    Infisical December update
                  </div>
                  <div className="mt-1 mb-1 w-full text-sm font-normal leading-[1.2rem] text-mineshaft-300">
                    Infisical Agent, new SDKs, Machine Identities, and more!
                  </div>
                  <div className="mt-2 h-[6.77rem] w-full rounded-md border border-mineshaft-700">
                    <Image
                      src="/images/infisical-update-december-2023.png"
                      height={319}
                      width={539}
                      alt="kubernetes image"
                      className="rounded-sm"
                    />
                  </div>
                  <div className="mt-3 flex w-full items-center justify-between px-0.5">
                    <button
                      type="button"
                      onClick={() => closeUpdate()}
                      className="text-mineshaft-400 duration-200 hover:text-mineshaft-100"
                    >
                      Close
                    </button>
                    <a
                      href="https://infisical.com/blog/infisical-update-december-2023"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-normal leading-[1.2rem] text-mineshaft-400 duration-200 hover:text-mineshaft-100"
                    >
                      Learn More{" "}
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="pl-0.5 text-xs" />
                    </a>
                  </div>
                </div>
                {router.asPath.includes("org") && (
                  <div
                    onKeyDown={() => null}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/org/${router.query.id}/members?action=invite`)}
                    className="w-full"
                  >
                    <div className="mb-3 w-full pl-5 duration-200 hover:text-mineshaft-200">
                      <FontAwesomeIcon icon={faPlus} className="mr-3" />
                      Invite people
                    </div>
                  </div>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="mb-2 w-full pl-5 duration-200 hover:text-mineshaft-200">
                      <FontAwesomeIcon icon={faQuestion} className="mr-3 px-[0.1rem]" />
                      Help & Support
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="p-1">
                    {supportOptions.map(([icon, text, url]) => (
                      <DropdownMenuItem key={url as string}>
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href={String(url)}
                          className="flex w-full items-center rounded-md font-normal text-mineshaft-300 duration-200"
                        >
                          <div className="relative flex w-full cursor-pointer select-none items-center justify-start rounded-md">
                            {icon}
                            <div className="text-sm">{text}</div>
                          </div>
                        </a>
                      </DropdownMenuItem>
                    ))}
                    {infisicalPlatformVersion && (
                      <div className="mb-2 mt-2 w-full cursor-default pl-5 text-sm duration-200 hover:text-mineshaft-200">
                        <FontAwesomeIcon icon={faInfo} className="mr-4 px-[0.1rem]" />
                        Version: {infisicalPlatformVersion}
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {subscription &&
                  subscription.slug === "starter" &&
                  !subscription.has_used_trial && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!subscription || !currentOrg) return;

                        // direct user to start pro trial
                        const url = await mutateAsync({
                          orgId: currentOrg.id,
                          success_url: window.location.href
                        });

                        window.location.href = url;
                      }}
                      className="mt-1.5 w-full"
                    >
                      <div className="justify-left mb-1.5 mt-1.5 flex w-full items-center rounded-md bg-mineshaft-600 py-1 pl-4 text-mineshaft-300 duration-200 hover:bg-mineshaft-500 hover:text-primary-400">
                        <FontAwesomeIcon
                          icon={faInfinity}
                          className="mr-3 ml-0.5 py-2 text-primary"
                        />
                        Start Free Pro Trial
                      </div>
                    </button>
                  )}
              </div>
            </nav>
          </aside>
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
          <CreateOrgModal
            isOpen={popUp?.createOrg?.isOpen}
            onClose={() => handlePopUpToggle("createOrg", false)}
          />
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 dark:[color-scheme:dark]">
            {children}
          </main>
        </div>
      </div>
      <div className="z-[200] flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t("common.no-mobile")} `}
        </p>
      </div>
    </>
  );
};
