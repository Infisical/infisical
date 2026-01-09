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
import { TSharedSecretResponse } from "@app/hooks/api/secretSharing";

import { BrandingTheme } from "../ViewSharedSecretByIDPage";
import { SecretShareInfo } from "./SecretShareInfo";

type Props = {
  secret: TSharedSecretResponse;
  secretKey: string | null;
  brandingTheme?: BrandingTheme;
};

export const SecretContainer = ({ secret, secretKey: key, brandingTheme }: Props) => {
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

  const panelStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.panelBg,
        borderColor: brandingTheme.panelBorder
      }
    : undefined;

  const secretDisplayStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.inputBg,
        color: brandingTheme.textColor
      }
    : undefined;

  const iconButtonStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.buttonBg,
        color: brandingTheme.textColor
      }
    : undefined;

  return (
    <div
      className={`rounded-lg border p-4 ${brandingTheme ? "" : "border-mineshaft-600 bg-mineshaft-800"}`}
      style={panelStyle}
    >
      <div
        className={`flex items-center justify-between rounded-md p-2 text-base ${
          brandingTheme ? "" : "bg-white/5 text-gray-400"
        }`}
        style={secretDisplayStyle}
      >
        <p className="break-all whitespace-pre-wrap">
          {isVisible ? decryptedSecret : hiddenSecret}
        </p>
        <div className="flex">
          <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative size-9 hover:opacity-70"
            onClick={() => {
              navigator.clipboard.writeText(decryptedSecret);
              setCopyTextSecret("Copied");
            }}
            style={iconButtonStyle}
          >
            <FontAwesomeIcon icon={isCopyingSecret ? faCheck : faCopy} />
          </IconButton>
          <IconButton
            ariaLabel="toggle visibility"
            colorSchema="secondary"
            className="group relative ml-2 size-9 hover:opacity-70"
            onClick={() => setIsVisible.toggle()}
            style={iconButtonStyle}
          >
            <FontAwesomeIcon icon={isVisible ? faEyeSlash : faEye} />
          </IconButton>
        </div>
      </div>
      <SecretShareInfo secret={secret} brandingTheme={brandingTheme} />
      {!brandingTheme && (
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
      )}
    </div>
  );
};
