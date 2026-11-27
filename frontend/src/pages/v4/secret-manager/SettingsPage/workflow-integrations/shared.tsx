import { type ReactNode, useId } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Stack } from "@infisical/cipher/ui/layout";
import {
  SheetBody,
  SheetClose,
  SheetFooter,
  SheetHeader,
  SheetSections,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";

import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { orgHref, useGo } from "../../../links";

export const PLATFORM_LABELS: Record<WorkflowIntegrationPlatform, string> = {
  [WorkflowIntegrationPlatform.SLACK]: "Slack",
  [WorkflowIntegrationPlatform.MICROSOFT_TEAMS]: "Microsoft Teams"
};

const PLATFORM_IMAGES: Record<WorkflowIntegrationPlatform, string> = {
  [WorkflowIntegrationPlatform.SLACK]: "Slack.svg",
  [WorkflowIntegrationPlatform.MICROSOFT_TEAMS]: "Microsoft Teams.svg"
};

export const platformOf = (platform: WorkflowIntegrationPlatform) => ({
  name: PLATFORM_LABELS[platform],
  image: PLATFORM_IMAGES[platform]
});

export type PlatformFormProps = {
  projectId: string;
  orgId: string;
  title: ReactNode;
  lead?: ReactNode;
  pending: boolean;
  setPending: (pending: boolean) => void;
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
  title: ReactNode;
  lead?: ReactNode;
  pending?: boolean;
  loading?: boolean;
  saveDisabled?: boolean;
  onSubmit?: () => void;
  children?: ReactNode;
}) => {
  const formId = useId();
  return (
    <SheetSections
      header={
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
      }
      footer={
        <SheetFooter>
          <Button
            type="submit"
            form={formId}
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
      }
    >
      <SheetBody>
        <form
          id={formId}
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.();
          }}
        >
          <Stack gap={16}>
            {lead}
            {loading ? <Skeleton lines={4} height={32} /> : children}
          </Stack>
        </form>
      </SheetBody>
    </SheetSections>
  );
};

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
