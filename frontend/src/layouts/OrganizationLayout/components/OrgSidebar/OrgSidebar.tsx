import {
  faBook,
  faCog,
  faDoorClosed,
  faInfinity,
  faMoneyBill,
  faPlug,
  faShare,
  faTable,
  faUserCog,
  faUsers,
  faUserTie
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { Menu, MenuGroup, MenuItem, Tooltip } from "@app/components/v2";
import { useOrganization, useSubscription, useUser } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useGetOrgTrialUrl } from "@app/hooks/api";

type Props = {
  isHidden?: boolean;
};

export const OrgSidebar = ({ isHidden }: Props) => {
  const { subscription } = useSubscription();

  const { user } = useUser();
  const { mutateAsync } = useGetOrgTrialUrl();

  const { currentOrg } = useOrganization();

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);

  return (
    <>
      <AnimatePresence mode="popLayout">
        {!isHidden && (
          <motion.aside
            key="org-sidebar"
            transition={{ duration: 0.3 }}
            initial={{ opacity: 0, translateX: -240 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: -240 }}
            layout
            className="dark z-10 w-60 border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-800 to-mineshaft-900"
          >
            <nav className="items-between flex h-full flex-col overflow-y-auto dark:[color-scheme:dark]">
              <Menu>
                <MenuGroup title="Overview">
                  <Link to="/organization/projects">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faTable} />
                          </div>
                          Projects
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link to="/organization/access-management">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faUsers} />
                          </div>
                          Access Control
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link to="/organization/billing">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faMoneyBill} className="mr-4" />
                          </div>
                          Usage & Billing
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link to="/organization/audit-logs">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faBook} className="mr-4" />
                          </div>
                          Audit Logs
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link to="/organization/settings">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faCog} className="mr-4" />
                          </div>
                          Organization Settings
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                </MenuGroup>
                <MenuGroup title="Resources">
                  <Link to="/organization/app-connections">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faPlug} className="mr-4" />
                          </div>
                          App Connections
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link to="/organization/gateways">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faDoorClosed} className="mr-4" />
                          </div>
                          Gateways
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                </MenuGroup>
              </Menu>
              <div className="flex-grow" />
              <Menu>
                {subscription &&
                  subscription.slug === "starter" &&
                  !subscription.has_used_trial && (
                    <Tooltip content="Start Free Pro Trial">
                      <MenuItem
                        className="relative flex items-center gap-2 overflow-hidden text-sm text-mineshaft-400 hover:text-mineshaft-300"
                        leftIcon={
                          <FontAwesomeIcon
                            className="mx-1 inline-block shrink-0"
                            icon={faInfinity}
                          />
                        }
                        onClick={async () => {
                          if (!subscription || !currentOrg) return;

                          // direct user to start pro trial
                          const url = await mutateAsync({
                            orgId: currentOrg.id,
                            success_url: window.location.href
                          });

                          window.location.href = url;
                        }}
                      >
                        Pro Trial
                      </MenuItem>
                    </Tooltip>
                  )}
                <Link to="/organization/secret-sharing">
                  <MenuItem
                    className="relative flex items-center gap-2 overflow-hidden text-sm text-mineshaft-400 hover:text-mineshaft-300"
                    leftIcon={
                      <div className="w-6">
                        <FontAwesomeIcon className="mx-1 inline-block shrink-0" icon={faShare} />
                      </div>
                    }
                  >
                    Share Secret
                  </MenuItem>
                </Link>
                <Link to="/organization/admin">
                  <MenuItem
                    className="relative flex items-center gap-2 overflow-hidden text-sm text-mineshaft-400 hover:text-mineshaft-300"
                    leftIcon={
                      <div className="w-6">
                        <FontAwesomeIcon className="mx-1 inline-block shrink-0" icon={faUserCog} />
                      </div>
                    }
                  >
                    Organization Admin
                  </MenuItem>
                </Link>
                {user.superAdmin && (
                  <Link to="/admin">
                    <MenuItem
                      className="relative flex items-center gap-2 overflow-hidden text-sm text-mineshaft-400 hover:text-mineshaft-300"
                      leftIcon={
                        <div className="w-6">
                          <FontAwesomeIcon
                            className="mx-1 inline-block shrink-0"
                            icon={faUserTie}
                          />
                        </div>
                      }
                    >
                      Server Console
                    </MenuItem>
                  </Link>
                )}
              </Menu>
            </nav>
          </motion.aside>
        )}
      </AnimatePresence>
      <CreateOrgModal
        isOpen={popUp?.createOrg?.isOpen}
        onClose={() => handlePopUpToggle("createOrg", false)}
      />
    </>
  );
};
