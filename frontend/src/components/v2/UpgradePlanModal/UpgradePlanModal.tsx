import Link from "next/link";
import { useSubscription } from "@app/context";
import { Button } from "../Button";
import { Modal, ModalClose, ModalContent } from "../Modal";

type Props = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  text: string;
};

export const UpgradePlanModal = ({ text, isOpen, onOpenChange }: Props): JSX.Element => {
  const { subscription } = useSubscription();
  const link = (subscription && subscription.slug !== null) 
    ? `/settings/billing/${localStorage.getItem("projectData.id") as string}` 
    : "https://infisical.com/scheduledemo";
  
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Unleash Infisical's Full Power"
        footerContent={[
          <Link
            href={link}
            key="upgrade-plan"
          >
            <Button className="mr-4 ml-2 mb-2">Upgrade Plan</Button>
          </Link>,
          <ModalClose asChild key="upgrade-plan-cancel">
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        ]}
      >
        <p className="mb-2 text-bunker-300">{text}</p>
        <p className="text-bunker-300">
          Upgrade and get access to this, as well as to other powerful enhancements.
        </p>
      </ModalContent>
    </Modal>
  )
}