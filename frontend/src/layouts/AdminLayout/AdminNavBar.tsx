import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowLeft,
  faBuilding,
  faCog,
  faDatabase,
  faGlobe,
  faKey,
  faLock,
  faPlug,
  faUserTie
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Tab, TabList, Tabs } from "@app/components/v2";

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

export const AdminNavBar = () => {
  const matchRoute = useMatchRoute();

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
              <Link to="/organization/projects">
                <Tab value="back" className="flex gap-x-2">
                  <FontAwesomeIcon icon={faGlobe} />
                  <FontAwesomeIcon icon={faArrowLeft} />
                </Tab>
              </Link>
              {[...generalTabs, ...othersTabs].map((tab) => {
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
