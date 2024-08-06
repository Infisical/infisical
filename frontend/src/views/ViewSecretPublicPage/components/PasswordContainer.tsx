import { useState, ChangeEvent } from "react";

import { faArrowRight, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, IconButton, Input } from "@app/components/v2";
import { useValidateSecretPassword } from "@app/hooks/api/secretSharing";
import { createNotification } from "@app/components/notifications";

type Props = {
  secretId: string;
  hashedHex: string;
  handlePassMatch: (val: boolean) => void;
};

export const PasswordContainer = ({ secretId, hashedHex, handlePassMatch }: Props) => {
  const [password, setPassword] = useState<string>('')
  const [isLoading, setLoading] = useState(false)
  const { refetch } = useValidateSecretPassword({
    sharedSecretId: secretId,
    hashedHex,
    userPassword: password,
  })

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
  }

  const validatePassword = async () => {
    setLoading(true);

    try {
      const { data: freshData } = await refetch();

      if (freshData?.isValid === true) {
        handlePassMatch(true);
      } else {
        createNotification({
          text: "Password is Invalid. Try again",
          type: "error"
        })
      }
    } catch (error) {
      console.error("Failed to validate password:", error);
      createNotification({
        text: "Failed to validate password",
        type: "error"
      })
    } finally {
      setLoading(false);
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
            <FontAwesomeIcon 
              className={isLoading ? 'fa-spin' : ''} 
              icon={isLoading ? faSpinner : faArrowRight} 
            />
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
