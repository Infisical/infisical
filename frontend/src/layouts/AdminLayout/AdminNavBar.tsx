import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowLeft,
  faBuilding,
  faCog,
  faDatabase,
  faKey,
  faLock,
  faPlug,
  faUserTie
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Tab, TabList, Tabs, Tooltip } from "@app/components/v2";
import { useOrganization } from "@app/context";

const generalTabs = [
  {
    label: "General",
    icon: faCog,
    link: "/admin/"
  },
  {
    label: "Resource Overview",
    icon: faBuilding,
    link: "/admin/resources/overview"
  },
  {
    label: "Access Control",
    icon: faUserTie,
    link: "/admin/access-management"
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

export const AdminNavBar = () => {
  const matchRoute = useMatchRoute();
  const { currentOrg } = useOrganization();

  return (
    <div className="border-b border-mineshaft-600 bg-mineshaft-900">
      <motion.div
        initial={{ x: -150 }}
        animate={{ x: 0 }}
        exit={{ x: -150 }}
        transition={{ duration: 0.2 }}
        className="px-4"
      >
        <nav className="w-full">
          <Tabs value="selected">
            <TabList className="border-b-0">
              <Tooltip position="bottom" content="Back to organization">
                <Link to="/organizations/$orgId/projects" params={{ orgId: currentOrg.id }}>
                  <Tab value="back">
                    <FontAwesomeIcon icon={faArrowLeft} />
                  </Tab>
                </Link>
              </Tooltip>
              {generalTabs.map((tab) => {
                const isActive = matchRoute({ to: tab.link, fuzzy: false });
                return (
                  <Link key={tab.link} to={tab.link}>
                    <Tab variant="instance" value={isActive ? "selected" : ""}>
                      {tab.label}
                    </Tab>
                  </Link>
                );
              })}
            </TabList>
          </Tabs>
        </nav>
      </motion.div>
    </div>
  );
};
