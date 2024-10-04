import { ReactNode } from "react";

import { Modal, ModalContent } from "@app/components/v2";

type Props = {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    title: string;
    subtitle: string;
    children: ReactNode
};

export const FormModal = (props: Props) => {
    const {isOpen, onOpenChange, title, subtitle, children} = props
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <ModalContent
        title={title}
        subTitle={subtitle}
      >
        {children}
      </ModalContent>
    </Modal>
  );
};
