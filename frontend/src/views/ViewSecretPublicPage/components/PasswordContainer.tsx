import { useState, ChangeEvent } from "react";
import {
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, IconButton, Input } from "@app/components/v2";
import { TViewSharedSecretResponse } from "@app/hooks/api/secretSharing";

type Props = {
  secret: TViewSharedSecretResponse;
  handlePassMatch: (val: boolean) => void;
};

export const PasswordContainer = ({ secret, handlePassMatch }: Props) => {
  const [password, setPassword] = useState<string>('')

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
  }

  const validatePassword = () => {
    if (secret.password === password) {
      handlePassMatch(true)
    }
  }

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
      <div className="flex items-center gap-2 justify-between rounded-md">
        <Input onChange={handleChange} placeholder="Enter Password to view secret"></Input>
        <div className="flex">
        <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative"
            onClick={() => {
              validatePassword()
            }}
          >
            <FontAwesomeIcon icon={faArrowRight} />
          </IconButton>
        </div>
      </div>
      <Button
        className="mt-4 w-full bg-mineshaft-700 py-3 text-bunker-200"
        colorSchema="primary"
        variant="outline_bg"
        size="sm"
        onClick={() => window.open("https://app.infisical.com/share-secret", "_blank")}
        rightIcon={<FontAwesomeIcon icon={faArrowRight} className="pl-2" />}
      >
        Share your own secret
      </Button>
    </div>
  );
};
