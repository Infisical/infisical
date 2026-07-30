import { useState } from "react";
import { GlobeIcon } from "lucide-react";

import { DocumentationLinkBadge, SheetDescription, SheetTitle } from "@app/components/v3";

import { PROXIED_SERVICE_QUICKSTART_URL } from "./forms/stepMeta";

type Props = {
  title: string;
  subtitle?: string;
  image?: string;
};

export const ProxiedServiceModalHeader = ({ title, subtitle, image }: Props) => {
  const [imgError, setImgError] = useState(false);

  return (
    <>
      <div className="flex items-center gap-x-3">
        {image && (
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-mineshaft-700">
            {imgError ? (
              <GlobeIcon className="h-4 w-4 text-bunker-300" />
            ) : (
              <img
                src={`/images/integrations/${image}`}
                alt=""
                className="h-5 w-5 object-contain"
                onError={() => setImgError(true)}
              />
            )}
          </div>
        )}
        <SheetTitle>{title}</SheetTitle>
        <DocumentationLinkBadge href={PROXIED_SERVICE_QUICKSTART_URL} />
      </div>
      {subtitle && <SheetDescription>{subtitle}</SheetDescription>}
    </>
  );
};
