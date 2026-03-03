import { INFISICAL_SCHEDULE_DEMO_LINK } from "@app/const/links";
import { useOrganization, useSubscription } from "@app/context";
import { useGetOrgTrialUrl } from "@app/hooks/api";

import { Button } from "../../v2/Button";
import { Modal, ModalContent } from "../../v2/Modal";

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

  const getLink = () => {
    // self-hosting
    if (!subscription || subscription.slug === null) {
      return INFISICAL_SCHEDULE_DEMO_LINK;
    }

    // Infisical cloud
    if (isEnterpriseFeature) {
      return "https://infisical.com/talk-to-us";
    }

    return "/organization/billing" as const;
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
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Unleash Infisical's Full Power">
        <p className="mb-2 text-bunker-300">{text}</p>
        <p className="text-bunker-300">
          Upgrade and get access to this, as well as to other powerful enhancements.
        </p>
        <div className="mt-8 flex items-center">
          <Button
            isLoading={isPending}
            colorSchema="primary"
            onClick={handleUpgradeBtnClick}
            className="mr-4"
          >
            {getUpgradePlanLabel()}
          </Button>
          <Button
            colorSchema="secondary"
            variant="plain"
            onClick={() => onOpenChange && onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};
