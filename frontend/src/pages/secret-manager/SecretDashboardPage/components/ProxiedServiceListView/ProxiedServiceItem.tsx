import { useState } from "react";
import { subject } from "@casl/ability";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRightLeftIcon, PencilIcon, Trash2Icon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Badge, IconButton } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionProxiedServiceActions } from "@app/context/ProjectPermissionContext/types";
import { ProxiedServiceCredentialRole } from "@app/hooks/api/proxiedServices/enums";
import { TDashboardProxiedService } from "@app/hooks/api/proxiedServices/types";

type Props = {
  proxiedService: TDashboardProxiedService;
  onEdit: () => void;
  onDelete: () => void;
};

export const ProxiedServiceItem = ({ proxiedService, onEdit, onDelete }: Props) => {
  const { name, hostPattern, isEnabled, credentials, environment, folder } = proxiedService;
  const [isExpanded, setIsExpanded] = useState(false);

  const permissionSubject = subject(ProjectPermissionSub.ProxiedServices, {
    environment: environment.slug,
    secretPath: folder.path
  });

  return (
    <>
      <div
        className="group flex cursor-pointer border-b border-mineshaft-600 hover:bg-mineshaft-700"
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "Collapse" : "Expand"} proxied service ${name}`}
      >
        <div className="flex w-11 items-center py-2 pl-5 text-mineshaft-400">
          <ArrowRightLeftIcon className="size-4 text-proxied-service" />
        </div>
        <div className="flex grow items-center py-2 pr-2 pl-4">
          <div className="flex w-full flex-wrap items-center gap-x-2.5">
            <span>{name}</span>
            <Badge variant="neutral">{hostPattern}</Badge>
            {!isEnabled && <Badge variant="neutral">Disabled</Badge>}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key="options"
            className="flex w-24 items-center justify-end gap-x-1 border-l border-mineshaft-600 px-2 py-3"
            initial={{ x: 0, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 10, opacity: 0 }}
          >
            <ProjectPermissionCan
              I={ProjectPermissionProxiedServiceActions.Edit}
              a={permissionSubject}
              renderTooltip
              allowedLabel="Edit"
            >
              {(isAllowed) => (
                <IconButton
                  aria-label="Edit proxied service"
                  variant="ghost"
                  size="xs"
                  isDisabled={!isAllowed}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <PencilIcon className="size-4" />
                </IconButton>
              )}
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionProxiedServiceActions.Delete}
              a={permissionSubject}
              renderTooltip
              allowedLabel="Delete"
            >
              {(isAllowed) => (
                <IconButton
                  aria-label="Delete proxied service"
                  variant="danger"
                  size="xs"
                  isDisabled={!isAllowed}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2Icon className="size-4" />
                </IconButton>
              )}
            </ProjectPermissionCan>
          </motion.div>
        </AnimatePresence>
      </div>
      {isExpanded && (
        <div className="border-b border-mineshaft-600 bg-bunker-800">
          {credentials.length === 0 && (
            <div className="px-5 py-2 pl-16 text-sm text-mineshaft-400">
              No credentials configured
            </div>
          )}
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center gap-x-2 border-b border-mineshaft-700 px-5 py-2 pl-16 last:border-b-0"
            >
              <span className="font-mono text-sm text-bunker-200">{cred.secretKey}</span>
              <Badge variant="neutral">
                {cred.role === ProxiedServiceCredentialRole.HeaderRewrite
                  ? cred.headerName || "Basic Auth"
                  : "Substitution"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
