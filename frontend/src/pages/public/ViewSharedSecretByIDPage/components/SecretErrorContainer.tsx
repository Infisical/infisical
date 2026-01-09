import { faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { BrandingTheme } from "../ViewSharedSecretByIDPage";

type Props = {
  brandingTheme?: BrandingTheme;
};

export const SecretErrorContainer = ({ brandingTheme }: Props) => {
  const panelStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.panelBg,
        borderColor: brandingTheme.panelBorder,
        color: brandingTheme.textColor
      }
    : undefined;

  return (
    <div
      className={twMerge(
        "rounded-lg border p-8",
        !brandingTheme && "border-mineshaft-600 bg-mineshaft-800"
      )}
      style={panelStyle}
    >
      <div className="text-center">
        <FontAwesomeIcon icon={faKey} size="2x" />
        <p className="mt-4">The secret you are looking for is missing or has expired</p>
      </div>
    </div>
  );
};
