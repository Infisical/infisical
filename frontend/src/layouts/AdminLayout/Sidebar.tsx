import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faBuilding,
  faChevronLeft,
  faCog,
  faDatabase,
  faKey,
  faLock,
  faPlug,
  faUserTie
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useMatchRoute } from "@tanstack/react-router";

import { Menu, MenuGroup, MenuItem } from "@app/components/v2";

const generalTabs = [
  {
    label: "General",
    icon: faCog,
    link: "/admin/"
  },
  {
    label: "Encryption",
    icon: faLock,
    link: "/admin/encryption"
  },
  {
    label: "Authentication",
    icon: faCheckCircle,
    link: "/admin/authentication"
  },
  {
    label: "Integrations",
    icon: faPlug,
    link: "/admin/integrations"
  },
  {
    label: "Caching",
    icon: faDatabase,
    link: "/admin/caching"
  },
  {
    label: "Environment Variables",
    icon: faKey,
    link: "/admin/environment"
  }
];

const othersTabs = [
  {
    label: "Access Controls",
    icon: faUserTie,
    link: "/admin/access-management"
  },
  {
    label: "Resource Overview",
    icon: faBuilding,
    link: "/admin/resources/overview"
  }
];

export const AdminSidebar = () => {
  const matchRoute = useMatchRoute();

  return (
    <aside className="dark w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60">
      <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
        <div className="flex-1">
          <Menu>
            <MenuGroup title="Configuration">
              {generalTabs.map((tab) => {
                const isActive = matchRoute({ to: tab.link, fuzzy: false });
                return (
                  <Link key={tab.link} to={tab.link}>
                    <MenuItem isSelected={Boolean(isActive)}>
                      <div className="mx-1 flex gap-2">
                        <div className="w-6">
                          <FontAwesomeIcon icon={tab.icon} />
                        </div>
                        {tab.label}
                      </div>
                    </MenuItem>
                  </Link>
                );
              })}
            </MenuGroup>
            <MenuGroup title="Others">
              {othersTabs.map((tab) => {
                const isActive = matchRoute({ to: tab.link, fuzzy: false });
                return (
                  <Link key={tab.link} to={tab.link}>
                    <MenuItem isSelected={Boolean(isActive)}>
                      <div className="mx-1 flex gap-2">
                        <div className="w-6">
                          <FontAwesomeIcon icon={tab.icon} />
                        </div>
                        {tab.label}
                      </div>
                    </MenuItem>
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
              Back to Organization
            </MenuItem>
          </Link>
        </Menu>
      </nav>
    </aside>
  );
};
