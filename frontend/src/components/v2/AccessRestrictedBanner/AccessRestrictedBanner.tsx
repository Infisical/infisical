import { ReactNode } from "react";
import { LockIcon } from "lucide-react";

import { Badge, Card } from "@app/components/v3";

type Props = {
  title?: string;
  body?: ReactNode;
};

export const AccessRestrictedBanner = ({
  title = "Access Restricted",
  body = "Your current role doesn't provide access to this feature. Contact your administrator to request access."
}: Props) => {
  return (
    <Card className="w-full max-w-lg items-start gap-4 p-8">
      <Badge variant="warning" className="h-6 px-2">
        <LockIcon />
        {title}
      </Badge>
      <div className="text-2xl font-semibold">This section is locked.</div>
      <div className="text-sm leading-relaxed text-accent">{body}</div>
    </Card>
  );
};
