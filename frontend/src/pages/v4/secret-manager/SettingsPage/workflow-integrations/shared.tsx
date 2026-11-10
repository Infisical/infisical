import type { ReactNode } from "react";

import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Stack } from "@app/components/v4/ui/layout";
import {
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { orgHref, useGo } from "../../../links";

export const PLATFORM_LABELS: Record<WorkflowIntegrationPlatform, string> = {
  [WorkflowIntegrationPlatform.SLACK]: "Slack",
  [WorkflowIntegrationPlatform.MICROSOFT_TEAMS]: "Microsoft Teams"
};

export type PlatformFormProps = {
  projectId: string;
  orgId: string;
  title: string;
  lead?: ReactNode;
  onClose: () => void;
};

export const SheetForm = ({
  title,
  lead,
  pending = false,
  loading = false,
  saveDisabled = false,
  onSubmit,
  children
}: {
  title: string;
  lead?: ReactNode;
  pending?: boolean;
  loading?: boolean;
  saveDisabled?: boolean;
  onSubmit?: () => void;
  children?: ReactNode;
}) => (
  <SheetContent size="md" pending={pending}>
    <form
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
      </SheetHeader>
      <SheetBody>
        <Stack gap={16}>
          {lead}
          {loading ? <Skeleton lines={4} height={32} /> : children}
        </Stack>
      </SheetBody>
      <SheetFooter>
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          disabled={saveDisabled || loading}
        >
          Save
        </Button>
        <SheetClose asChild>
          <Button variant="outline">Cancel</Button>
        </SheetClose>
      </SheetFooter>
    </form>
  </SheetContent>
);

export const NoOrgIntegration = ({
  orgId,
  platform
}: {
  orgId: string;
  platform: WorkflowIntegrationPlatform;
}) => {
  const go = useGo();
  const isSlack = platform === WorkflowIntegrationPlatform.SLACK;
  return (
    <Alert
      tone="info"
      title={`No ${PLATFORM_LABELS[platform]} integrations connected`}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(orgHref(orgId, "/integrations?selectedTab=workflow-integrations"))}
        >
          Go to organization integrations
        </Button>
      }
    >
      {isSlack
        ? "Connect a Slack workspace to your organization before configuring project notifications."
        : "Connect a Microsoft Teams tenant to your organization before configuring project notifications."}
    </Alert>
  );
};

export const sameDraft = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
