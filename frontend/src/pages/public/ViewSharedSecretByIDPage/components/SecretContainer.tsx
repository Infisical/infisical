import { useMemo } from "react";
import {
  faArrowRight,
  faCheck,
  faCopy,
  faEye,
  faEyeSlash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { decryptSymmetric } from "@app/components/utilities/cryptography/crypto";
import { Button, IconButton } from "@app/components/v2";
import { useTimedReset, useToggle } from "@app/hooks";
import { TViewSharedSecretResponse } from "@app/hooks/api/secretSharing";

import { SecretShareInfo } from "./SecretShareInfo";

type Props = {
  secret: TViewSharedSecretResponse["secret"];
  secretKey: string | null;
};

export const SecretContainer = ({ secret, secretKey: key }: Props) => {
  const [isVisible, setIsVisible] = useToggle(false);
  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const decryptedSecret = useMemo(() => {
    if (secret.secretValue) {
      return secret.secretValue;
    }

    if (secret && secret.encryptedValue && key) {
      const res = decryptSymmetric({
        ciphertext: secret.encryptedValue,
        iv: secret.iv,
        tag: secret.tag,
        key
      });
      return res;
    }
    return "";
  }, [secret, key]);

  const hiddenSecret = decryptedSecret ? "*".repeat(decryptedSecret.length) : "";

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
      <div className="flex items-center justify-between rounded-md bg-white/5 p-2 text-base text-gray-400">
        <p className="break-all whitespace-pre-wrap">
          {isVisible ? decryptedSecret : hiddenSecret}
        </p>
        <div className="flex">
          <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative"
            onClick={() => {
              navigator.clipboard.writeText(decryptedSecret);
              setCopyTextSecret("Copied");
            }}
          >
            <FontAwesomeIcon icon={isCopyingSecret ? faCheck : faCopy} />
          </IconButton>
          <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative ml-2"
            onClick={() => setIsVisible.toggle()}
          >
            <FontAwesomeIcon icon={isVisible ? faEyeSlash : faEye} />
          </IconButton>
        </div>
      </div>
      <SecretShareInfo secret={secret} />
      <Button
        className="mt-4 w-full bg-mineshaft-700 py-3 text-bunker-200"
        colorSchema="primary"
        variant="outline_bg"
        size="sm"
        onClick={() => window.open("/share-secret", "_blank", "noopener")}
        rightIcon={<FontAwesomeIcon icon={faArrowRight} className="pl-2" />}
      >
        Share Your Own Secret
      </Button>
    </div>
  );
};
