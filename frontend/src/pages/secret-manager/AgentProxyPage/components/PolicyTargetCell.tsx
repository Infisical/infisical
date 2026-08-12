import { useState } from "react";
import { GlobeIcon } from "lucide-react";

import { PROXIED_SERVICE_TEMPLATES } from "@app/helpers/proxiedServiceTemplates";

// The frontend template list carries the display half (name, icon); the backend copy is authoritative
// for the host pattern and credential slots. A target with no entry here falls back to a globe.
export const findPolicyTemplate = (target: string) =>
  PROXIED_SERVICE_TEMPLATES.find((template) => template.key === target);

export const PolicyTargetIcon = ({ target }: { target: string }) => {
  const [imgError, setImgError] = useState(false);
  const template = findPolicyTemplate(target);

  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded bg-mineshaft-700">
      {template && !imgError ? (
        <img
          src={`/images/integrations/${template.image}`}
          alt=""
          className="size-4 object-contain"
          onError={() => setImgError(true)}
        />
      ) : (
        <GlobeIcon className="size-3.5 text-bunker-300" />
      )}
    </div>
  );
};

export const PolicyTargetCell = ({ target }: { target: string }) => {
  const template = findPolicyTemplate(target);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <PolicyTargetIcon target={target} />
      <span className="truncate capitalize">{template?.name ?? target}</span>
    </div>
  );
};
