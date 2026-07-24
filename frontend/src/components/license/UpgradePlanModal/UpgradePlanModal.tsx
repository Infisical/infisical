import { SparklesIcon } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator
} from "@app/components/v3";
import { INFISICAL_SCHEDULE_DEMO_LINK } from "@app/const/links";
import { useOrganization, useSubscription } from "@app/context";
import { useScopeVariant } from "@app/hooks";
import { useGetOrgTrialUrl } from "@app/hooks/api";

type Props = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  text: string;
  isEnterpriseFeature?: boolean;
};

export const UpgradePlanModal = ({
  text,
  isOpen,
  onOpenChange,
  isEnterpriseFeature = false
}: Props): JSX.Element => {
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const { mutateAsync, isPending } = useGetOrgTrialUrl();
  const scopeVariant = useScopeVariant();

  const getLink = () => {
    // self-hosting
    if (!subscription || subscription.slug === null) {
      return INFISICAL_SCHEDULE_DEMO_LINK;
    }

    // Infisical cloud
    if (isEnterpriseFeature) {
      return "https://infisical.com/talk-to-us";
    }

    const billingUri = `/organizations/${currentOrg?.rootOrgId ?? currentOrg?.id}/billing`;
    return billingUri;
  };

  const link = getLink();

  const handleUpgradeBtnClick = async () => {
    try {
      if (!subscription || !currentOrg) return;

      if (!subscription.has_used_trial && !isEnterpriseFeature) {
        // direct user to start pro trial

        const url = await mutateAsync({
          orgId: currentOrg.id,
          success_url: window.location.href
        });

        window.location.href = url;
      } else {
        // direct user to upgrade their plan
        window.location.href = link;
      }
    } catch (err) {
      console.error(err);
    }
  };
  const getUpgradePlanLabel = () => {
    if (subscription) {
      if (isEnterpriseFeature) {
        return "Talk to Us";
      }
      if (!subscription.has_used_trial) {
        return "Start Pro Free Trial";
      }
    }
    return "Upgrade Plan";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/* z-[70] keeps this above legacy v2 modals (z-[60]) that open it, e.g. RoleModal */}
      <DialogContent className="z-[70] sm:max-w-xl" overlayClassName="z-[70]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <SparklesIcon className="size-5 text-muted" />
            Unleash Infisical&apos;s Full Power
          </DialogTitle>
          <DialogDescription>
            Upgrade and get access to this, as well as to other powerful enhancements.
          </DialogDescription>
        </DialogHeader>

        <Separator />
        <p className="text-sm leading-relaxed text-foreground">{text}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange?.(false)}>
            Cancel
          </Button>
          <Button
            variant={scopeVariant}
            isPending={isPending}
            isDisabled={isPending}
            onClick={handleUpgradeBtnClick}
          >
            {getUpgradePlanLabel()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
