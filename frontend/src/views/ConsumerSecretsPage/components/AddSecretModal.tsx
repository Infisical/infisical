import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { Modal, ModalContent } from "@app/components/v2";
import { useCreateConsumerSecret, useEditConsumerSecret } from "@app/hooks/api/consumerSecrets";

import { AddSecretForm } from "./AddSecretForm";
import { decryptData } from "./encryptionUtil";

interface InitialData {
  id?: string;
  type: string;
  title: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  content?: string;
}

interface AddSecretModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: InitialData | null;
}

export const AddSecretModal = ({ isOpen, onClose, initialData }: AddSecretModalProps) => {
  const createConsumerSecret = useCreateConsumerSecret();
  const editConsumerSecret = useEditConsumerSecret();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (data: InitialData) => {
    const { id } = data;
    try {
      setIsSubmitting(true);

      if (id) {
        console.log("Editing Secret with ID:", id);
        await editConsumerSecret.mutateAsync({ consumerSecretId: id, ...data });
      } else {
        console.log("Creating New Secret");
        const { id: newId, ...dataWithoutId } = data;
        await createConsumerSecret.mutateAsync(dataWithoutId);
      }

      createNotification({
        text: id ? "Successfully updated the consumer secret" : "Successfully added the consumer secret",
        type: "success"
      });
      onClose();
    } catch (error) {
      console.error("Error in handleSubmit:", error);
      createNotification({
        text: id ? "Failed to update the consumer secret" : "Failed to add the consumer secret",
        type: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const defaultInitialData: InitialData = {
    type: "web-login",
    title: "",
    username: "",
    password: "",
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    content: ""
  };

  const decryptedInitialData = initialData
    ? {
        ...initialData,
        password: initialData.password ? decryptData(initialData.password) : undefined,
        cardNumber: initialData.cardNumber ? decryptData(initialData.cardNumber) : undefined,
        cvv: initialData.cvv ? decryptData(initialData.cvv) : undefined,
        content: initialData.content ? decryptData(initialData.content) : undefined
      }
    : defaultInitialData;

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose}>
      <ModalContent
        title={initialData?.id ? "Edit Consumer Secret" : "Add Consumer Secret"}
        subTitle={initialData?.id ? "Edit the details of your consumer secret." : "Add a new consumer secret by selecting the type and filling in the details."}
      >
        <AddSecretForm onSubmit={handleSubmit} isSubmitting={isSubmitting} initialData={decryptedInitialData} />
      </ModalContent>
    </Modal>
  );
};
