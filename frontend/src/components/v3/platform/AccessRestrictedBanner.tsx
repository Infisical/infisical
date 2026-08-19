import { ReactNode, useId } from "react";
import { LockIcon } from "lucide-react";

import { Badge, Card } from "../generic";

type AccessRestrictedBannerProps = {
  title?: string;
  body?: ReactNode;
};

const AccessRestrictedBanner = ({
  title = "Access Restricted",
  body = "Your current role doesn't provide access to this feature. Contact your administrator to request access."
}: AccessRestrictedBannerProps) => {
  const headingId = useId();

  return (
    <Card
      role="region"
      aria-labelledby={headingId}
      className="w-full max-w-lg items-start gap-4 p-8"
    >
      <Badge variant="warning" className="h-6 px-2">
        <LockIcon aria-hidden="true" />
        {title}
      </Badge>
      <h2 id={headingId} className="text-2xl font-semibold">
        This section is locked.
      </h2>
      <div className="text-sm leading-relaxed text-accent">{body}</div>
    </Card>
  );
};

export { AccessRestrictedBanner, type AccessRestrictedBannerProps };
