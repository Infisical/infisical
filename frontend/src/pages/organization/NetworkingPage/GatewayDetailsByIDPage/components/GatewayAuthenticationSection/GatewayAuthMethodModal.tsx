import { Modal, ModalContent } from "@app/components/v2";

import { GatewayAuthMethod, gatewayAuthMethodToNameMap } from "./AuthMethodComponentMap";
import { GatewayAuthMethodModalContent } from "./GatewayAuthMethodModalContent";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  gatewayId: string;
  attachedMethods: GatewayAuthMethod[];
  editMethod: GatewayAuthMethod | null;
};

export const GatewayAuthMethodModal = ({
  isOpen,
  onOpenChange,
  gatewayId,
  attachedMethods,
  editMethod
}: Props) => {
  const isUpdate = Boolean(editMethod);
  const title = isUpdate
    ? `Edit ${editMethod ? gatewayAuthMethodToNameMap[editMethod] : ""}`
    : "Add Auth Method";

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title={title}>
        {isOpen && (
          <GatewayAuthMethodModalContent
            gatewayId={gatewayId}
            attachedMethods={attachedMethods}
            initialMethod={editMethod ?? undefined}
            isUpdate={isUpdate}
            onClose={() => onOpenChange(false)}
          />
        )}
      </ModalContent>
    </Modal>
  );
};
