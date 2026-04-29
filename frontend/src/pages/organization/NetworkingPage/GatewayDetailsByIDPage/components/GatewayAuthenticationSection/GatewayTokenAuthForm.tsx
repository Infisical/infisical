import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
import { useAddResourceTokenAuth } from "@app/hooks/api/resourceAuthMethods";

type Props = {
  gatewayId: string;
  onClose: () => void;
};

export const GatewayTokenAuthForm = ({ gatewayId, onClose }: Props) => {
  const { mutateAsync: add } = useAddResourceTokenAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      await add({ resource: { type: "gateway", id: gatewayId } });
      createNotification({ type: "success", text: "Token auth attached" });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
          onClick={onSubmit}
        >
          Add
        </Button>
        <Button colorSchema="secondary" variant="plain" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
