import { Link, useMatchRoute } from "@tanstack/react-router";

import { Menu, MenuGroup, MenuItem } from "@app/components/v2";

export const SecretSharingSideBar = () => {
  const matchRoute = useMatchRoute();
  const isOverviewActive = !!matchRoute({
    to: "/organization/secret-sharing",
    fuzzy: false
  });

  return (
    <Menu>
      <MenuGroup title="Overview">
        <Link to="/organization/secret-sharing">
          {() => (
            <MenuItem isSelected={isOverviewActive} icon="lock-closed">
              Secret Sharing
            </MenuItem>
          )}
        </Link>
      </MenuGroup>
      <MenuGroup title="Other">
        <Link to="/organization/secret-sharing/settings">
          {({ isActive }) => (
            <MenuItem isSelected={isActive} icon="toggle-settings">
              Settings
            </MenuItem>
          )}
        </Link>
      </MenuGroup>
    </Menu>
  );
};
