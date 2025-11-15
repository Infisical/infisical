import { useState } from "react";

import { Modal, ModalContent } from "@app/components/v2";
import { RelayDeploymentMethodSelect } from "@app/pages/organization/NetworkingPage/components/RelayTab/components/RelayDeploymentMethodSelect";

import { RelayCliDeploymentMethod } from "./RelayCliDeploymentMethod";
import { RelayCliSystemdDeploymentMethod } from "./RelayCliSystemdDeploymentMethod";
import { RelayTerraformDeploymentMethod } from "./RelayTerraformDeploymentMethod";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const RelayDeploymentInfoMap = {
  cli: { name: "CLI", image: "SSH.png", component: RelayCliDeploymentMethod },
  systemd: { name: "CLI (systemd)", image: "SSH.png", component: RelayCliSystemdDeploymentMethod },
  terraform: {
    name: "Terraform",
    image: "Terraform.png",
    component: RelayTerraformDeploymentMethod
  }
} as const;

export type RelayDeploymentMethod = keyof typeof RelayDeploymentInfoMap;

const Content = () => {
  const [selectedMethod, setSelectedMethod] = useState<null | RelayDeploymentMethod>(null);

  if (selectedMethod) {
    const ComponentToRender = RelayDeploymentInfoMap[selectedMethod]?.component;
    if (ComponentToRender) {
      return <ComponentToRender />;
    }
  }

  return <RelayDeploymentMethodSelect onSelect={setSelectedMethod} />;
};

export const RelayDeployModal = ({ isOpen, onOpenChange }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Deploy Relay"
        subTitle="Select a deployment method to use for the relay."
        bodyClassName="overflow-visible"
      >
        <Content />
      </ModalContent>
    </Modal>
  );
};
