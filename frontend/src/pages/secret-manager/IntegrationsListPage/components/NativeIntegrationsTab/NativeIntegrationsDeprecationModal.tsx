import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon, CheckIcon, RefreshCwIcon } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const BENEFITS = [
  "Continuous, automatic syncing with no manual re-runs",
  "Reusable App Connections shared across syncs",
  "Actively maintained and supported"
];

export const NativeIntegrationsDeprecationModal = () => {
  const [isOpen, setIsOpen] = useState(true);
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const handleExploreSecretSyncs = () => {
    navigate({
      to: ROUTE_PATHS.SecretManager.IntegrationsListPage.path,
      params: { orgId: currentOrg.id, projectId: currentProject.id },
      search: { selectedTab: IntegrationsListPageTabs.SecretSyncs }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-[500px]" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9.5 shrink-0 items-center justify-center rounded-lg border border-project/10 bg-project/15">
              <RefreshCwIcon className="size-4 text-project" />
            </div>
            <DialogTitle className="text-base">
              Native Integrations Are Moving to Secret Syncs
            </DialogTitle>
          </div>
          <DialogDescription>
            This tab is deprecated. Secret Syncs are the maintained replacement and cover the same
            third-party services.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-4">
          {BENEFITS.map((benefit) => (
            <div key={benefit} className="flex items-start gap-2.5">
              <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
              <span className="text-sm text-foreground">{benefit}</span>
            </div>
          ))}
        </div>
        <DialogFooter className="sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Button variant="project" onClick={handleExploreSecretSyncs}>
              Explore Secret Syncs
              <ArrowRightIcon />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
