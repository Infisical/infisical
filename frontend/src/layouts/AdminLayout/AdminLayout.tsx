/* eslint-disable no-nested-ternary */
/* eslint-disable no-unexpected-multiline */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable vars-on-top */
/* eslint-disable no-var */
/* eslint-disable func-names */
// @ts-nocheck

import { useTranslation } from "react-i18next";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faGithub, faSlack } from "@fortawesome/free-brands-svg-icons";
import {
  faArrowLeft,
  faArrowUpRightFromSquare,
  faBook,
  faEnvelope,
  faInfinity,
  faInfo,
  faMobile,
  faPlus,
  faQuestion
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@app/components/v2";
import { useOrganization, useSubscription, useUser } from "@app/context";
import {
  useGetOrgTrialUrl,
  useGetUserAction,
  useLogoutUser,
  useRegisterUserAction
} from "@app/hooks/api";

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

export const AdminLayout = ({ children }: LayoutProps) => {
  const router = useRouter();
  const { mutateAsync } = useGetOrgTrialUrl();

  // eslint-disable-next-line prefer-const
  const { currentOrg } = useOrganization();

  const { user } = useUser();
  const { subscription } = useSubscription();
  const { data: updateClosed } = useGetUserAction("september_update_closed");
  const infisicalPlatformVersion = process.env.NEXT_PUBLIC_INFISICAL_PLATFORM_VERSION;

  const { t } = useTranslation();

  const registerUserAction = useRegisterUserAction();

  const closeUpdate = async () => {
    await registerUserAction.mutateAsync("september_update_closed");
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

  return (
    <>
      <div className="dark hidden h-screen w-full flex-col overflow-x-hidden md:flex">
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <aside className="dark w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60">
            <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
              <div>
                {!router.asPath.includes("personal") && (
                  <div className="flex h-12 cursor-default justify-between items-center px-3 pt-6">
                    <Link href={`/org/${currentOrg?._id}/overview`}>
                      <div className="my-6 flex cursor-default items-center justify-center pr-2 text-sm text-mineshaft-300 hover:text-mineshaft-100">
                        <FontAwesomeIcon icon={faArrowLeft} className="pr-3" />
                        Back to organization
                      </div>
                    </Link>
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
              </div>
              <div
                className={`relative mt-10 ${
                  subscription && subscription.slug === "starter" && !subscription.has_used_trial
                    ? "mb-2"
                    : "mb-4"
                } flex w-full cursor-default flex-col items-center px-3 text-sm text-mineshaft-400`}
              >
                <div
                  className={`${
                    !updateClosed ? "block" : "hidden"
                  } relative z-10 mb-6 flex pb-2 w-52 flex-col items-center justify-start rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3`}
                >
                  <div className="text-md mt-2 w-full font-semibold text-mineshaft-100">
                    Infisical September update
                  </div>
                  <div className="mt-1 mb-1 w-full text-sm font-normal leading-[1.2rem] text-mineshaft-300">
                    Improved RBAC, new integrations, dashboard remake, and more!
                  </div>
                  <div className="mt-2 h-[6.77rem] w-full rounded-md border border-mineshaft-700">
                    <Image
                      src="/images/infisical-update-september-2023.png"
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
                      href="https://infisical.com/blog/infisical-update-september-2023"
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
                      <DropdownMenuItem key={url}>
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
                          orgId: currentOrg._id,
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
                {infisicalPlatformVersion && (
                  <div className="mb-2 w-full pl-5 duration-200 hover:text-mineshaft-200">
                    <FontAwesomeIcon icon={faInfo} className="mr-4 px-[0.1rem]" />
                    Version: {infisicalPlatformVersion}
                  </div>
                )}
              </div>
            </nav>
          </aside>
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
