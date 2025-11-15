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
  const { isRootOrganization } = useOrganization();
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
                  <Link to="/organization/projects">
                    {({ isActive }) => (
                      <Tab variant={variant} value={isActive ? "selected" : ""}>
                        Overview
                      </Tab>
                    )}
                  </Link>
                  <Link to="/organization/app-connections">
                    {({ isActive }) => (
                      <Tab variant={variant} value={isActive ? "selected" : ""}>
                        App Connections
                      </Tab>
                    )}
                  </Link>
                  <Link to="/organization/networking">
                    {({ isActive }) => (
                      <Tab variant={variant} value={isActive ? "selected" : ""}>
                        Networking
                      </Tab>
                    )}
                  </Link>
                  <Link to="/organization/secret-sharing">
                    {({ isActive }) => (
                      <Tab value={isActive ? "selected" : ""} variant={variant}>
                        Secret Sharing
                      </Tab>
                    )}
                  </Link>
                  <Link to="/organization/access-management">
                    {({ isActive }) => (
                      <Tab
                        variant={variant}
                        value={
                          isActive ||
                          pathname.match(
                            /organization\/members|organization\/identities|organization\/groups|organization\/roles/
                          )
                            ? "selected"
                            : ""
                        }
                      >
                        Access Control
                      </Tab>
                    )}
                  </Link>
                  <Link to="/organization/audit-logs">
                    {({ isActive }) => (
                      <Tab variant={variant} value={isActive ? "selected" : ""}>
                        Audit Logs
                      </Tab>
                    )}
                  </Link>
                  {isRootOrganization && (
                    <Link to="/organization/billing">
                      {({ isActive }) => (
                        <Tab variant={variant} value={isActive ? "selected" : ""}>
                          Usage & Billing
                        </Tab>
                      )}
                    </Link>
                  )}
                  <Link to="/organization/settings">
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
