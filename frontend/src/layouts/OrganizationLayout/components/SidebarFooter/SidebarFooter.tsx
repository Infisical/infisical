import { faGithub, faSlack } from "@fortawesome/free-brands-svg-icons";
import {
  faAnglesLeft,
  faAnglesRight,
  faArrowUpRightFromSquare,
  faBook,
  faEnvelope,
  faInfinity,
  faInfo,
  faInfoCircle,
  faPlus,
  faQuestion,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate } from "@tanstack/react-router";

import { WishForm } from "@app/components/features/WishForm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MenuItem
} from "@app/components/v2";
import { envConfig } from "@app/config/env";
import { useOrganization, useSubscription, useUser } from "@app/context";
import { useGetOrgTrialUrl, useLogoutUser } from "@app/hooks/api";

import { MenuIconButton } from "../MenuIconButton";

export const INFISICAL_SUPPORT_OPTIONS = [
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

type Props = {
  isCollapsed?: boolean;
  onToggleSidebar: () => void;
};

export const SidebarFooter = ({ isCollapsed, onToggleSidebar }: Props) => {
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();

  const { mutateAsync } = useGetOrgTrialUrl();

  const { user } = useUser();
  const navigate = useNavigate();
  const logout = useLogoutUser();
  const logOutUser = async () => {
    try {
      console.log("Logging out...");
      await logout.mutateAsync();
      navigate({ to: "/login" });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div
      className={`relative mt-10 ${
        subscription && subscription.slug === "starter" && !subscription.has_used_trial
          ? "mb-2"
          : "mb-4"
      } flex w-full cursor-default flex-col items-center ${isCollapsed ? "px-1" : "px-2"} text-sm text-mineshaft-400`}
    >
      {(window.location.origin.includes("https://app.infisical.com") ||
        window.location.origin.includes("https://gamma.infisical.com")) &&
        !isCollapsed && <WishForm />}
      {!isCollapsed && (
        <Link
          to="/organization/access-management"
          search={{
            action: "invite"
          }}
          className="w-full"
        >
          <div className="mb-3 w-full pl-2 duration-200 hover:text-mineshaft-200">
            <FontAwesomeIcon icon={faPlus} className="mr-3" />
            Invite people
          </div>
        </Link>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger className="w-full">
          {isCollapsed ? (
            <MenuIconButton>
              <FontAwesomeIcon icon={faInfoCircle} className="mb-3 text-lg" />
              Support
            </MenuIconButton>
          ) : (
            <div className="mb-4 flex w-full items-center pl-2 duration-200 hover:text-mineshaft-200">
              <FontAwesomeIcon icon={faQuestion} className="mr-3 px-[0.1rem]" />
              Help & Support
            </div>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="p-1">
          {INFISICAL_SUPPORT_OPTIONS.map(([icon, text, url]) => (
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
          {envConfig.PLATFORM_VERSION && (
            <div className="mb-2 mt-2 w-full cursor-default pl-5 text-sm duration-200 hover:text-mineshaft-200">
              <FontAwesomeIcon icon={faInfo} className="mr-4 px-[0.1rem]" />
              Version: {envConfig.PLATFORM_VERSION}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {subscription && subscription.slug === "starter" && !subscription.has_used_trial && (
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
            <FontAwesomeIcon icon={faInfinity} className="ml-0.5 mr-3 py-2 text-primary" />
            Start Free Pro Trial
          </div>
        </button>
      )}
      {isCollapsed ? (
        <MenuIconButton onClick={onToggleSidebar} className="p-4">
          <FontAwesomeIcon icon={faAnglesRight} className="text-lg" />
        </MenuIconButton>
      ) : (
        <MenuItem onClick={onToggleSidebar} className="mb-2 w-full px-2 text-mineshaft-400">
          <FontAwesomeIcon icon={faAnglesLeft} className="mr-3" />
          Collapse
        </MenuItem>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger className="w-full">
          {isCollapsed ? (
            <div>
              <MenuIconButton>
                <div className="my-1 flex h-6 w-6 items-center justify-center rounded-md bg-primary text-sm uppercase text-black">
                  {user?.firstName?.charAt(0)}
                </div>
              </MenuIconButton>
            </div>
          ) : (
            <div className="flex w-full cursor-pointer items-center rounded-md border border-mineshaft-600 p-2 px-1">
              <div className="mr-2 flex h-6 w-6 items-center justify-center rounded-md bg-primary text-sm uppercase">
                {user?.firstName?.charAt(0)}
              </div>
              <div className="max-w-40 flex-grow truncate text-ellipsis text-left text-sm capitalize text-white">
                {user?.firstName} {user?.lastName}
              </div>
              <div>
                <FontAwesomeIcon icon={faUser} className="text-xs text-mineshaft-400" />
              </div>
            </div>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="p-1">
          <div className="px-2 py-1 text-xs text-mineshaft-400">{user?.username}</div>
          <Link to="/personal-settings">
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
            <Link to="/admin">
              <DropdownMenuItem className="mt-1 border-t border-mineshaft-600">
                Server Admin Console
              </DropdownMenuItem>
            </Link>
          )}
          <Link to="/organization/admin">
            <DropdownMenuItem className="mt-1 border-t border-mineshaft-600">
              Organization Admin Console
            </DropdownMenuItem>
          </Link>
          <div className="mt-1 h-1 border-t border-mineshaft-600" />
          <button type="button" onClick={logOutUser} className="w-full">
            <DropdownMenuItem>Log Out</DropdownMenuItem>
          </button>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
