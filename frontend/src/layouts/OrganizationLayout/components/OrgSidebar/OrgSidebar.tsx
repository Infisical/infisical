import {
  faBook,
  faCheckCircle,
  faCog,
  faCubes,
  faDoorClosed,
  faInfinity,
  faMoneyBill,
  faPlug,
  faShare,
  faUserCog,
  faUsers,
  faUserTie
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { Button, Menu, MenuGroup, MenuItem, Tooltip } from "@app/components/v2";
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
            className="dark z-10 w-60 border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 pb-4"
          >
            <nav className="items-between flex h-full flex-col overflow-y-auto dark:[color-scheme:dark]">
              <Menu>
                <MenuGroup title="Overview">
                  <Link to="/organization/projects">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1">
                          <FontAwesomeIcon icon={faCubes} className="mr-4" />
                          Projects
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link to="/organization/access-management">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1">
                          <FontAwesomeIcon icon={faUsers} className="mr-4" />
                          Access Control
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link to="/organization/billing">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1">
                          <FontAwesomeIcon icon={faMoneyBill} className="mr-4" />
                          Usage & Billing
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link to="/organization/audit-logs">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1">
                          <FontAwesomeIcon icon={faBook} className="mr-4" />
                          Audit Logs
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link to="/organization/sso">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-4" />
                          SSO Settings
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link to="/organization/settings">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1">
                          <FontAwesomeIcon icon={faCog} className="mr-4" />
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
                        <div className="mx-1">
                          <FontAwesomeIcon icon={faPlug} className="mr-4" />
                          App Connections
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link to="/organization/gateways">
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1">
                          <FontAwesomeIcon icon={faDoorClosed} className="mr-4" />
                          Gateways
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                </MenuGroup>
              </Menu>
              <div className="flex-grow" />
              <div>
                {subscription &&
                  subscription.slug === "starter" &&
                  !subscription.has_used_trial && (
                    <Tooltip content="Start Free Pro Trial">
                      <Button
                        variant="outline_bg"
                        className="w-full"
                        onClick={async () => {
                          if (!subscription || !currentOrg) return;

                          // direct user to start pro trial
                          const url = await mutateAsync({
                            orgId: currentOrg.id,
                            success_url: window.location.href
                          });

                          window.location.href = url;
                        }}
                        leftIcon={
                          <FontAwesomeIcon
                            icon={faInfinity}
                            className="py-2 text-lg text-primary"
                          />
                        }
                      >
                        Pro Trial
                      </Button>
                    </Tooltip>
                  )}
              </div>
              <div className="w-full p-2">
                <Link to="/organization/secret-sharing">
                  <Button
                    variant="outline_bg"
                    className="w-full"
                    leftIcon={<FontAwesomeIcon icon={faShare} />}
                  >
                    Share Secret
                  </Button>
                </Link>
              </div>
              <div className="flex gap-2 px-2">
                <div className="flex-1">
                  {user.superAdmin ? (
                    <Tooltip content="Organization Admin" sideOffset={16}>
                      <Link to="/organization/admin">
                        <Button variant="outline_bg" className="w-full py-3">
                          <FontAwesomeIcon icon={faUserCog} size="lg" />
                        </Button>
                      </Link>
                    </Tooltip>
                  ) : (
                    <Link to="/organization/admin">
                      <Button
                        variant="outline_bg"
                        className="w-full"
                        leftIcon={<FontAwesomeIcon icon={faUserCog} />}
                      >
                        Org Admin
                      </Button>
                    </Link>
                  )}
                </div>
                {user.superAdmin && (
                  <div className="flex-1">
                    <Tooltip content="Server Console Admin" sideOffset={16}>
                      <Link to="/admin">
                        <Button variant="outline_bg" className="w-full py-3">
                          <FontAwesomeIcon icon={faUserTie} size="lg" />
                        </Button>
                      </Link>
                    </Tooltip>
                  </div>
                )}
              </div>
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
