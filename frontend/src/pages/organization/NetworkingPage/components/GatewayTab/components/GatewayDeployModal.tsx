import { useState } from "react";

import { Modal, ModalContent } from "@app/components/v2";
import { GatewayDeploymentMethodSelect } from "@app/pages/organization/NetworkingPage/components/GatewayTab/components/GatewayDeploymentMethodSelect";

import { GatewayCliDeploymentMethod } from "./GatewayCliDeploymentMethod";
import { GatewayCliSystemdDeploymentMethod } from "./GatewayCliSystemdDeploymentMethod";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const GatewayDeploymentInfoMap = {
  cli: { name: "CLI", image: "SSH.png", component: GatewayCliDeploymentMethod },
  systemd: { name: "CLI (systemd)", image: "SSH.png", component: GatewayCliSystemdDeploymentMethod }
} as const;

export type GatewayDeploymentMethod = keyof typeof GatewayDeploymentInfoMap;

const Content = () => {
  const [selectedMethod, setSelectedMethod] = useState<null | GatewayDeploymentMethod>(null);

  if (selectedMethod) {
    const ComponentToRender = GatewayDeploymentInfoMap[selectedMethod]?.component;
    if (ComponentToRender) {
      return <ComponentToRender />;
    }
  }

  return <GatewayDeploymentMethodSelect onSelect={setSelectedMethod} />;
};

export const GatewayDeployModal = ({ isOpen, onOpenChange }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Deploy Gateway"
        subTitle="Select a deployment method to use for the gateway."
        bodyClassName="overflow-visible"
      >
        <Content />
      </ModalContent>
    </Modal>
  );
};
