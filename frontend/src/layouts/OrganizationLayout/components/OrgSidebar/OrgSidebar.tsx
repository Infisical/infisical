import { useState } from "react";
import {
  faBook,
  faCheckCircle,
  faCog,
  faDoorClosed,
  faInfinity,
  faMoneyBill,
  faPlug,
  faUserCog,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { Menu, MenuGroup, MenuItem, Modal, ModalContent, Tooltip } from "@app/components/v2";
import { useOrganization, useSubscription, useUser } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useGetOrgTrialUrl } from "@app/hooks/api";

import { ServerAdminsPanel } from "../ServerAdminsPanel/ServerAdminsPanel";

export const OrgSidebar = () => {
  const { subscription } = useSubscription();
  const [showAdminsModal, setShowAdminsModal] = useState(false);

  const { user } = useUser();
  const { mutateAsync } = useGetOrgTrialUrl();

  const { currentOrg } = useOrganization();

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);

  return (
    <>
      <aside className="dark z-10 w-60 border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 transition-all duration-150">
        <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
          <Menu>
            <MenuGroup title="Overview">
              <Link to="/organization/secret-manager/overview">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive} icon="notification-bell">
                    Projects
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
            <MenuGroup title="Admin Panels">
              {user?.superAdmin && (
                <Link to="/admin">
                  {({ isActive }) => (
                    <MenuItem isSelected={isActive}>
                      <div className="mx-1">
                        <FontAwesomeIcon icon={faUserCog} className="mr-4" />
                        Server Admin Console
                      </div>
                    </MenuItem>
                  )}
                </Link>
              )}
              <Link to="/organization/admin">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1">
                      <FontAwesomeIcon icon={faCog} className="mr-4" />
                      Org Admin Console
                    </div>
                  </MenuItem>
                )}
              </Link>
            </MenuGroup>
            <MenuGroup title="Others">
              <Link to="/organization/secret-sharing">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive} icon="lock-closed">
                    Share Secret
                  </MenuItem>
                )}
              </Link>
            </MenuGroup>
          </Menu>
          <div
            className={`relative mt-10 ${
              subscription && subscription.slug === "starter" && !subscription.has_used_trial
                ? "mb-2"
                : "mb-4"
            } flex w-full cursor-default flex-col items-center px-1 text-sm text-mineshaft-400`}
          >
            {subscription && subscription.slug === "starter" && !subscription.has_used_trial && (
              <Tooltip content="Start Free Pro Trial" side="right">
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
                  <div className="justify-left mb-1.5 mt-1.5 flex w-full flex-col items-center rounded-md p-1 text-xs text-mineshaft-300 transition-all duration-150 hover:bg-mineshaft-500 hover:text-primary-400">
                    <FontAwesomeIcon icon={faInfinity} className="py-2 text-lg text-primary" />
                    Pro Trial
                  </div>
                </button>
              </Tooltip>
            )}
          </div>
        </nav>
      </aside>
      <Modal isOpen={showAdminsModal} onOpenChange={setShowAdminsModal}>
        <ModalContent title="Server Administrators" subTitle="View all server administrators">
          <div className="mb-2">
            <ServerAdminsPanel />
          </div>
        </ModalContent>
      </Modal>
      <CreateOrgModal
        isOpen={popUp?.createOrg?.isOpen}
        onClose={() => handlePopUpToggle("createOrg", false)}
      />
    </>
  );
};
