import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useMatchRoute } from "@tanstack/react-router";

import { Menu, MenuGroup, MenuItem } from "@app/components/v2";

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
  },
  {
    label: "Environment Variables",
    icon: "unlock",
    link: "/admin/environment"
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
          <Menu>
            <MenuGroup title="General">
              {generalTabs.map((tab) => {
                const isActive = matchRoute({ to: tab.link, fuzzy: false });
                return (
                  <Link key={tab.link} to={tab.link}>
                    <MenuItem isSelected={Boolean(isActive)}>{tab.label}</MenuItem>
                  </Link>
                );
              })}
            </MenuGroup>
            <MenuGroup title="Resources">
              {resourceTabs.map((tab) => {
                const isActive = matchRoute({ to: tab.link, fuzzy: false });
                return (
                  <Link key={tab.link} to={tab.link}>
                    <MenuItem isSelected={Boolean(isActive)}>{tab.label}</MenuItem>
                  </Link>
                );
              })}
            </MenuGroup>
          </Menu>
        </div>
        <Menu>
          <Link to="/organization/projects">
            <MenuItem
              className="relative flex items-center gap-2 overflow-hidden text-sm text-mineshaft-400 hover:text-mineshaft-300"
              leftIcon={
                <FontAwesomeIcon
                  className="mx-1 inline-block shrink-0"
                  icon={faChevronLeft}
                  flip="vertical"
                />
              }
            >
              Back to organization
            </MenuItem>
          </Link>
        </Menu>
      </nav>
    </aside>
  );
};
