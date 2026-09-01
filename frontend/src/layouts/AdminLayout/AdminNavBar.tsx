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

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
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
        <nav aria-label="Admin sections" className="no-scrollbar overflow-x-auto">
          <div className="flex h-11 w-max min-w-full items-stretch gap-1 border-b border-border">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/organizations/$orgId/projects"
                  params={{ orgId: currentOrg.id }}
                  aria-label="Back to organization"
                  className="inline-flex items-center justify-center px-3 text-sm text-foreground/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                >
                  <FontAwesomeIcon icon={faArrowLeft} aria-hidden />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">Back to organization</TooltipContent>
            </Tooltip>
            {generalTabs.map((tab) => {
              const isActive = matchRoute({ to: tab.link, fuzzy: false });
              return (
                <Link
                  key={tab.link}
                  to={tab.link}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative inline-flex items-center px-3 text-sm whitespace-nowrap text-foreground/60 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                    isActive &&
                      "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-admin"
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </motion.div>
    </div>
  );
};
