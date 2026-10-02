import { useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import {
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";

const overviewRoute =
  "/organizations/$orgId/projects/secret-management/$projectId/overview" as const;

type Props = {
  orgId: string;
  projectId: string;
  secretPath: string;
  environmentSlug: string;
  isProjectMember: boolean;
  onNavigate?: () => void;
};

// Org-wide value results include projects the user is not a member of, and the project overview
// cannot load for them, so the link is disabled rather than sending them to a failing page.
export const GoToSecretFolderButton = ({
  orgId,
  projectId,
  secretPath,
  environmentSlug,
  isProjectMember,
  onNavigate
}: Props) => {
  const navigate = useNavigate();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button fires no pointer events, so the span carries the tooltip hover. */}
          <span className="inline-flex opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Go to secret folder"
              isDisabled={!isProjectMember}
              onClick={() => {
                onNavigate?.();
                navigate({
                  to: overviewRoute,
                  params: { orgId, projectId },
                  search: { secretPath, environments: [environmentSlug] }
                });
              }}
            >
              <ArrowRightIcon className="size-3.5" />
            </IconButton>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {isProjectMember ? "Go to secret folder" : "You don't have access to this project"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
