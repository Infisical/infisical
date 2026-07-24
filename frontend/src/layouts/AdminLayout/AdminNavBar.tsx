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

import {
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
    <div className="border-b border-border bg-card">
      <motion.div
        initial={{ x: -150 }}
        animate={{ x: 0 }}
        exit={{ x: -150 }}
        transition={{ duration: 0.2 }}
        className="px-4"
      >
        <nav className="w-full">
          <Tabs value="selected">
            <TabsList variant="admin">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="back" asChild>
                    <Link to="/organizations/$orgId/projects" params={{ orgId: currentOrg.id }}>
                      <FontAwesomeIcon icon={faArrowLeft} />
                    </Link>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Back to organization</TooltipContent>
              </Tooltip>
              {generalTabs.map((tab) => {
                const isActive = matchRoute({ to: tab.link, fuzzy: false });
                return (
                  <TabsTrigger key={tab.link} value={isActive ? "selected" : ""} asChild>
                    <Link to={tab.link}>{tab.label}</Link>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </nav>
      </motion.div>
    </div>
  );
};
