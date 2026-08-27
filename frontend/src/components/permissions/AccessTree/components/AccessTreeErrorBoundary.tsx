import React, { ErrorInfo, ReactNode } from "react";
import { MongoAbility, MongoQuery } from "@casl/ability";
import { CheckIcon, CopyIcon, TriangleAlertIcon } from "lucide-react";

import { IconButton } from "@app/components/v3";
import { SessionStorageKeys } from "@app/const";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";
import { useTimedReset } from "@app/hooks";

interface ErrorBoundaryProps {
  children: ReactNode;
  permissions: MongoAbility<ProjectPermissionSet, MongoQuery>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const ErrorDisplay = ({
  error,
  permissions
}: {
  error: Error | null;
  permissions: MongoAbility<ProjectPermissionSet, MongoQuery>;
}) => {
  const display = JSON.stringify({ errorMessage: error?.message, permissions }, null, 2);

  const [isCopied, , setIsCopied] = useTimedReset<boolean>({
    initialState: false
  });

  const copyToClipboard = () => {
    navigator.clipboard.writeText(display);
    setIsCopied(true);
    sessionStorage.removeItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
  };

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="flex items-center gap-2 text-foreground">
        <TriangleAlertIcon className="size-4 shrink-0 text-danger" />
        <p>
          Error displaying access tree. Please contact{" "}
          <a
            className="inline text-accent underline decoration-accent underline-offset-4 transition-colors hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
            href="mailto:support@infisical.com"
          >
            support@infisical.com
          </a>{" "}
          with the following information.
        </p>
      </div>
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <pre className="thin-scrollbar w-full flex-1 overflow-y-auto rounded-sm border border-border bg-container p-2 text-xs whitespace-pre-wrap text-foreground">
          {display}
        </pre>
        <IconButton
          variant="ghost"
          size="sm"
          className="absolute top-2 right-4"
          aria-label="Copy access tree error details"
          onClick={copyToClipboard}
        >
          {isCopied ? <CheckIcon /> : <CopyIcon />}
        </IconButton>
      </div>
    </div>
  );
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Error caught by ErrorBoundary:", error, errorInfo, this.props);
  }

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, permissions } = this.props;

    if (hasError) {
      return <ErrorDisplay error={error} permissions={permissions} />;
    }
    return children;
  }
}

export const AccessTreeErrorBoundary = ({ children, permissions }: ErrorBoundaryProps) => {
  return <ErrorBoundary permissions={permissions}>{children}</ErrorBoundary>;
};
