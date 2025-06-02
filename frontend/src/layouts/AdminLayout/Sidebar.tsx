import { faArrowLeft, faInfo, faQuestion } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useMatchRoute } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Menu,
  MenuGroup,
  MenuItem
} from "@app/components/v2";
import { envConfig } from "@app/config/env";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { INFISICAL_SUPPORT_OPTIONS } from "../OrganizationLayout/components/MinimizedOrgSidebar/MinimizedOrgSidebar";

const generalTabs = [
  {
    label: "General",
    icon: "settings-cog",
    link: "/admin/"
  },
  {
    label: "Encryption",
    icon: "lock-closed",
    link: "/admin/encryption"
  },
  {
    label: "Authentication",
    icon: "check",
    link: "/admin/authentication"
  },
  {
    label: "Integrations",
    icon: "sliding-carousel",
    link: "/admin/integrations"
  },
  {
    label: "Caching",
    icon: "note",
    link: "/admin/caching"
  }
];

const resourceTabs = [
  {
    label: "Organizations",
    icon: "groups",
    link: "/admin/resources/organizations"
  },
  {
    label: "User Identities",
    icon: "user",
    link: "/admin/resources/user-identities"
  },
  {
    label: "Machine Identities",
    icon: "key-user",
    link: "/admin/resources/machine-identities"
  }
];

export const AdminSidebar = () => {
  const matchRoute = useMatchRoute();

  return (
    <aside className="dark w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60">
      <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
        <div className="flex-grow">
          <Link to={`/organization/${ProjectType.SecretManager}/overview` as const}>
            <div className="my-6 flex cursor-default items-center justify-center pr-2 text-sm text-mineshaft-300 hover:text-mineshaft-100">
              <FontAwesomeIcon icon={faArrowLeft} className="pr-3" />
              Back to organization
            </div>
          </Link>
          <Menu>
            <MenuGroup title="General">
              {generalTabs.map((tab) => {
                const isActive = matchRoute({ to: tab.link, fuzzy: false });
                return (
                  <Link key={tab.link} to={tab.link}>
                    <MenuItem isSelected={Boolean(isActive)} icon={tab.icon}>
                      {tab.label}
                    </MenuItem>
                  </Link>
                );
              })}
            </MenuGroup>
            <MenuGroup title="Resources">
              {resourceTabs.map((tab) => {
                const isActive = matchRoute({ to: tab.link, fuzzy: false });
                return (
                  <Link key={tab.link} to={tab.link}>
                    <MenuItem isSelected={Boolean(isActive)} icon={tab.icon}>
                      {tab.label}
                    </MenuItem>
                  </Link>
                );
              })}
            </MenuGroup>
          </Menu>
        </div>
        <div className="relative mb-4 mt-10 flex w-full cursor-default flex-col items-center px-3 text-sm text-mineshaft-400">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="mb-2 w-full pl-5 duration-200 hover:text-mineshaft-200">
                <FontAwesomeIcon icon={faQuestion} className="mr-3 px-[0.1rem]" />
                Help & Support
              </div>
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
        </div>
      </nav>
    </aside>
  );
};
