import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { Modal, ModalContent } from "@app/components/v2";
import { useTimedReset } from "@app/hooks";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AddShareSecretForm } from "./AddShareSecretForm";
import { ViewAndCopySharedSecret } from "./ViewAndCopySharedSecret";

const schema = yup.object({
  value: yup.string().max(10000).required().label("Shared Secret Value"),
  expiresInValue: yup.string().required().label("Expiration Value"),
  expiresAfterViews: yup.string().required().label("Expires After Views")
});

export type FormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["createSharedSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createSharedSecret"]>,
    state?: boolean
  ) => void;
  isPublic: boolean;
  inModal: boolean;
};

export const AddShareSecretModal = ({ popUp, handlePopUpToggle, isPublic, inModal }: Props) => {
  const {
    control,
    reset,
    handleSubmit,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: yupResolver(schema)
  });

  const [newSharedSecret, setNewSharedSecret] = useState("");
  const hasSharedSecret = Boolean(newSharedSecret);
  const [isUrlCopied, , setIsUrlCopied] = useTimedReset<boolean>({
    initialState: false
  });

  const [isSecretInputDisabled, setIsSecretInputDisabled] = useState(false);

  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(newSharedSecret);
    setIsUrlCopied(true);
  };
  useEffect(() => {
    if (isUrlCopied) {
      setTimeout(() => setIsUrlCopied(false), 2000);
    }
  }, [isUrlCopied]);

  useEffect(() => {
    if (popUp.createSharedSecret.data) {
      setValue("value", (popUp.createSharedSecret.data as { value: string }).value);
      setIsSecretInputDisabled(true);
    }
  }, [popUp.createSharedSecret.data]);

  // eslint-disable-next-line no-nested-ternary
  return inModal ? (
    <Modal
      isOpen={popUp?.createSharedSecret?.isOpen}
      onOpenChange={(open) => {
        handlePopUpToggle("createSharedSecret", open);
        reset();
        setNewSharedSecret("");
        setIsSecretInputDisabled(false);
      }}
    >
      <ModalContent
        title="Share a Secret"
        subTitle="Once you share a secret, the share link is only accessible once."
      >
        {!hasSharedSecret ? (
          <AddShareSecretForm
            isPublic={isPublic}
            inModal={inModal}
            control={control}
            handleSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            setNewSharedSecret={setNewSharedSecret}
            isInputDisabled={isSecretInputDisabled}
          />
        ) : (
          <ViewAndCopySharedSecret
            inModal={inModal}
            newSharedSecret={newSharedSecret}
            isUrlCopied={isUrlCopied}
            copyUrlToClipboard={copyUrlToClipboard}
          />
        )}
      </ModalContent>
    </Modal>
  ) : !hasSharedSecret ? (
    <AddShareSecretForm
      isPublic={isPublic}
      inModal={inModal}
      control={control}
      handleSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      setNewSharedSecret={setNewSharedSecret}
      isInputDisabled={isSecretInputDisabled}
    />
  ) : (
    <ViewAndCopySharedSecret
      inModal={inModal}
      newSharedSecret={newSharedSecret}
      isUrlCopied={isUrlCopied}
      copyUrlToClipboard={copyUrlToClipboard}
    />
  );
};
