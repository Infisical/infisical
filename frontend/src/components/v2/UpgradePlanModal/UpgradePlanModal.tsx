import { useOrganization, useSubscription } from "@app/context";
import {
    useGetOrgTrialUrl
} from "@app/hooks/api";

import { Button } from "../Button";
import { Modal, ModalContent } from "../Modal";

type Props = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  text: string;
};

export const UpgradePlanModal = ({ text, isOpen, onOpenChange }: Props): JSX.Element => {
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const { mutateAsync, isLoading } = useGetOrgTrialUrl();
  const link = (subscription && subscription.slug !== null) 
    ? `/settings/billing/${localStorage.getItem("projectData.id") as string}` 
    : "https://infisical.com/scheduledemo";
  
  const handleUpgradeBtnClick = async () => {
    try {
      if (!subscription || !currentOrg) return;
      
      if (!subscription.has_used_trial) {
        // direct user to start pro trial
        
        const url = await mutateAsync({
          orgId: currentOrg._id,
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
  }
  
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Unleash Infisical's Full Power"
      >
        <p className="mb-2 text-bunker-300">{text}</p>
        <p className="text-bunker-300">
          Upgrade and get access to this, as well as to other powerful enhancements.
        </p>
        <div className="mt-8 flex items-center">
          <Button
            isLoading={isLoading}
            colorSchema="primary"
            onClick={handleUpgradeBtnClick}
            className="mr-4"
          >
            {(subscription && !subscription.has_used_trial) ? "Start Pro Free Trial" : "Upgrade Plan"}
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
  )
}