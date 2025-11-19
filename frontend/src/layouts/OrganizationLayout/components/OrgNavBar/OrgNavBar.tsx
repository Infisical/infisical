import { Link, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { Tab, TabList, Tabs } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { usePopUp } from "@app/hooks";

type Props = {
  isHidden?: boolean;
};

export const OrgNavBar = ({ isHidden }: Props) => {
  const { isRootOrganization, currentOrg } = useOrganization();
  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);

  const { pathname } = useLocation();

  const variant = isRootOrganization ? "org" : "namespace";

  return (
    <>
      {!isHidden && (
        <div className="dark flex w-full flex-col overflow-x-hidden border-b border-mineshaft-600 bg-mineshaft-900 px-4">
          <motion.div
            key="menu-org-items"
            initial={{ x: -150 }}
            animate={{ x: 0 }}
            exit={{ x: -150 }}
            transition={{ duration: 0.2 }}
          >
            <nav className="w-full">
              <Tabs value="selected">
                <TabList className="border-b-0">
                  <Link to="/organizations/$orgId/projects" params={{ orgId: currentOrg.id }}>
                    {({ isActive }) => (
                      <Tab variant={variant} value={isActive ? "selected" : ""}>
                        Overview
                      </Tab>
                    )}
                  </Link>
                  <Link
                    to="/organizations/$orgId/app-connections"
                    params={{ orgId: currentOrg.id }}
                  >
                    {({ isActive }) => (
                      <Tab variant={variant} value={isActive ? "selected" : ""}>
                        App Connections
                      </Tab>
                    )}
                  </Link>
                  <Link to="/organizations/$orgId/networking" params={{ orgId: currentOrg.id }}>
                    {({ isActive }) => (
                      <Tab variant={variant} value={isActive ? "selected" : ""}>
                        Networking
                      </Tab>
                    )}
                  </Link>
                  <Link to="/organizations/$orgId/secret-sharing" params={{ orgId: currentOrg.id }}>
                    {({ isActive }) => (
                      <Tab value={isActive ? "selected" : ""} variant={variant}>
                        Secret Sharing
                      </Tab>
                    )}
                  </Link>
                  <Link
                    to="/organizations/$orgId/access-management"
                    params={{ orgId: currentOrg.id }}
                  >
                    {({ isActive }) => (
                      <Tab
                        variant={variant}
                        value={
                          isActive ||
                          pathname.match(/organizations\/[^/]+\/(members|identities|groups|roles)/)
                            ? "selected"
                            : ""
                        }
                      >
                        Access Control
                      </Tab>
                    )}
                  </Link>
                  <Link to="/organizations/$orgId/audit-logs" params={{ orgId: currentOrg.id }}>
                    {({ isActive }) => (
                      <Tab variant={variant} value={isActive ? "selected" : ""}>
                        Audit Logs
                      </Tab>
                    )}
                  </Link>
                  {isRootOrganization && (
                    <Link to="/organizations/$orgId/billing" params={{ orgId: currentOrg.id }}>
                      {({ isActive }) => (
                        <Tab variant={variant} value={isActive ? "selected" : ""}>
                          Usage & Billing
                        </Tab>
                      )}
                    </Link>
                  )}
                  <Link to="/organizations/$orgId/settings" params={{ orgId: currentOrg.id }}>
                    {({ isActive }) => (
                      <Tab variant={variant} value={isActive ? "selected" : ""}>
                        Settings
                      </Tab>
                    )}
                  </Link>
                </TabList>
              </Tabs>
            </nav>
          </motion.div>
        </div>
      )}
      <CreateOrgModal
        isOpen={popUp?.createOrg?.isOpen}
        onClose={() => handlePopUpToggle("createOrg", false)}
      />
    </>
  );
};
