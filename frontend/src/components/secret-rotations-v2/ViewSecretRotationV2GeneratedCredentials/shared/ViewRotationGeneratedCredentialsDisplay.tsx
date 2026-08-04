import { ReactNode } from "react";
import { CheckIcon, HistoryIcon } from "lucide-react";

type Props = {
  activeCredentials: ReactNode;
  inactiveCredentials?: ReactNode;
};

export const ViewRotationGeneratedCredentialsDisplay = ({
  activeCredentials,
  inactiveCredentials
}: Props) => {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="w-full border-b border-border">
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            <CheckIcon className="size-3.5 text-success" />
            Current Credentials
          </span>
        </div>
        <p className="text-sm text-muted">
          The active credential set currently mapped to the rotation secrets.
        </p>
        <div className="flex flex-col gap-x-8 gap-y-2 rounded-md border border-border bg-container p-2">
          {activeCredentials}
        </div>
      </div>
      {inactiveCredentials ? (
        <div className="flex flex-col gap-2">
          <div className="w-full border-b border-border">
            <span className="flex items-center gap-1.5 text-sm text-foreground">
              <HistoryIcon className="size-3.5 text-warning" />
              Retired Credentials
            </span>
          </div>
          <p className="text-sm text-muted">
            The retired credential set that will be revoked during the next rotation cycle.
          </p>
          <div className="flex flex-col gap-x-8 gap-y-2 rounded-md border border-border bg-container p-2">
            {inactiveCredentials}
          </div>
        </div>
      ) : null}
    </>
  );
};
