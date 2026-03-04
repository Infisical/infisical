import {
  faCheck,
  faCopy,
  faEye,
  faEyeSlash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useTimedReset, useToggle } from "@app/hooks";
import { TAccessSharedSecretResponse } from "@app/hooks/api/secretSharing";

import { BrandingTheme } from "../ViewSharedSecretByIDPage";
import { SecretShareInfo } from "./SecretShareInfo";

type Props = {
  secret: TAccessSharedSecretResponse;
  brandingTheme?: BrandingTheme;
};

export const SecretContainer = ({ secret, brandingTheme }: Props) => {
  const [isVisible, setIsVisible] = useToggle(false);
  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const hiddenSecret = "\u2022".repeat(secret.secretValue.length);

  const panelStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.panelBg,
        borderColor: brandingTheme.panelBorder
      }
    : undefined;

  const secretDisplayStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.inputBg,
        borderColor: brandingTheme.panelBorder,
        color: brandingTheme.textColor
      }
    : undefined;

  const buttonStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.buttonBg,
        borderColor: brandingTheme.panelBorder,
        color: brandingTheme.textColor
      }
    : undefined;

  return (
    <div
      className={`rounded-lg border p-4 ${brandingTheme ? "" : "border-mineshaft-600 bg-mineshaft-800"}`}
      style={panelStyle}
    >
      <div
        className={`flex items-center justify-between rounded-md border p-2 pl-3 text-base ${
          brandingTheme ? "" : "border-mineshaft-600 bg-mineshaft-700/50 text-gray-400"
        }`}
        style={secretDisplayStyle}
      >
        <p className="cursor-default break-all whitespace-pre-wrap">
          {isVisible ? secret.secretValue : hiddenSecret}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-mineshaft-500 bg-mineshaft-700/50 text-sm text-mineshaft-300 transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-white"
            onClick={() => {
              navigator.clipboard.writeText(secret.secretValue);
              setCopyTextSecret("Copied");
            }}
            style={buttonStyle}
          >
            <FontAwesomeIcon icon={isCopyingSecret ? faCheck : faCopy} />
          </button>
          <button
            type="button"
            className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-mineshaft-500 bg-mineshaft-700/50 text-sm text-mineshaft-300 transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-white"
            onClick={() => setIsVisible.toggle()}
            style={buttonStyle}
          >
            <FontAwesomeIcon icon={isVisible ? faEyeSlash : faEye} />
          </button>
        </div>
      </div>
      <SecretShareInfo secret={secret} brandingTheme={brandingTheme} />
    </div>
  );
};
