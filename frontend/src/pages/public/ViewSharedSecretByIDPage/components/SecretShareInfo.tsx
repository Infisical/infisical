import { faClock, faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { TAccessSharedSecretResponse } from "@app/hooks/api/secretSharing";

import { BrandingTheme } from "../ViewSharedSecretByIDPage";

type Props = {
  secret: TAccessSharedSecretResponse;
  brandingTheme?: BrandingTheme;
};

export const SecretShareInfo = ({ secret, brandingTheme }: Props) => {
  let timeRemaining: string | null = null;

  if (secret.expiresAt) {
    try {
      timeRemaining = format(new Date(secret.expiresAt), "yyyy-MM-dd 'at' HH:mm a");
    } catch {
      timeRemaining = null;
    }
  }

  let viewsRemaining: number | null = null;

  if (secret.expiresAfterViews) {
    viewsRemaining = secret.expiresAfterViews - 1;
  }

  if (!timeRemaining && viewsRemaining === null) {
    return null;
  }

  const infoStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.inputBg,
        borderColor: brandingTheme.panelBorder,
        color: brandingTheme.textMutedColor
      }
    : undefined;

  const iconStyle = brandingTheme ? { color: brandingTheme.textMutedColor } : undefined;

  return (
    <div
      className={`mt-4 flex flex-col gap-2 rounded-md border p-3 text-sm ${
        brandingTheme ? "" : "border-mineshaft-600 bg-mineshaft-700/50 text-gray-300"
      }`}
      style={infoStyle}
    >
      {timeRemaining && (
        <div className="flex items-center gap-2">
          <FontAwesomeIcon
            icon={faClock}
            className={brandingTheme ? "" : "text-mineshaft-400"}
            style={iconStyle}
          />
          <span>Expires on {timeRemaining}</span>
        </div>
      )}
      {viewsRemaining !== null && (
        <div className="flex items-center gap-2">
          <FontAwesomeIcon
            icon={faEye}
            className={brandingTheme ? "" : "text-mineshaft-400"}
            style={iconStyle}
          />
          <span>
            {viewsRemaining === 0
              ? "This is the last time you can view this secret"
              : `${viewsRemaining} more view${viewsRemaining === 1 ? "" : "s"} remaining`}
          </span>
        </div>
      )}
    </div>
  );
};
