import React, { ErrorInfo, ReactNode } from "react";
import { MongoAbility, MongoQuery } from "@casl/ability";
import { faCheck, faCopy, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton } from "@app/components/v2";
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
      <div className="flex items-center gap-2 text-mineshaft-100">
        <FontAwesomeIcon icon={faExclamationTriangle} className="text-red" />
        <p>
          Error displaying access tree. Please contact{" "}
          <a
            className="inline cursor-pointer text-mineshaft-200 underline decoration-primary-500 underline-offset-4 duration-200 hover:text-mineshaft-100"
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
        <pre className="thin-scrollbar w-full flex-1 overflow-y-auto whitespace-pre-wrap rounded bg-mineshaft-700 p-2 text-xs text-mineshaft-100">
          {display}
        </pre>
        <IconButton
          variant="plain"
          colorSchema="secondary"
          className="absolute right-4 top-2"
          ariaLabel="Copy secret value"
          onClick={copyToClipboard}
        >
          <FontAwesomeIcon icon={isCopied ? faCheck : faCopy} />
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
