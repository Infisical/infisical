import { useEffect, useState } from "react";

import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  serverName: string;
  isLoading?: boolean;
  errorMessage?: string;
  onSubmit: (token: string) => void;
};

export const BearerTokenModal = ({
  isOpen,
  onOpenChange,
  serverName,
  isLoading,
  errorMessage,
  onSubmit
}: Props) => {
  const [token, setToken] = useState("");

  // Clear token when modal closes
  useEffect(() => {
    if (!isOpen) {
      setToken("");
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (token) {
      onSubmit(token);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Enter Bearer Token" subTitle={`Authenticate with ${serverName}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <FormControl
            label="Bearer Token"
            helperText="This credential will be securely stored in Infisical"
            isError={Boolean(errorMessage)}
            errorText={errorMessage}
          >
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_1a2b3c4d5e6f7g8h9i0j"
              autoComplete="off"
            />
          </FormControl>
          <div className="flex items-center justify-end">
            <Button
              colorSchema="secondary"
              variant="plain"
              className="py-2"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isDisabled={!token || isLoading}
              isLoading={isLoading}
              className="ml-4"
            >
              Submit
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
