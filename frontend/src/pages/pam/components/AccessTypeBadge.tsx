import { KeyRound, Rocket } from "lucide-react";

import { Badge } from "@app/components/v3";
import { PamAccessType } from "@app/hooks/api/pam";

// Requests raised before credential access existed carry no accessType; those were session requests
export const AccessTypeBadge = ({ accessType }: { accessType?: PamAccessType }) =>
  accessType === PamAccessType.Credential ? (
    <Badge variant="warning">
      <KeyRound className="mr-1 size-3" />
      Credentials
    </Badge>
  ) : (
    <Badge variant="neutral">
      <Rocket className="mr-1 size-3" />
      Session
    </Badge>
  );
