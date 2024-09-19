import React, { ErrorInfo, ReactNode } from "react";
import { useRouter } from "next/router";
import { faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const ErrorPage = ({ error }: { error: Error | null }) => {
  const router = useRouter();
  const currentUrl = router?.asPath?.split("?")?.[0];

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-mineshaft-900">
      <div className="flex max-w-md flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 text-center text-mineshaft-200">
        <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
        <p>
          Something unexpected went wrong. Please contact{" "}
          <a
            className="inline cursor-pointer text-mineshaft-100 underline decoration-primary-500 underline-offset-4 opacity-80 duration-200 hover:opacity-100"
            target="_blank"
            rel="noopener noreferrer"
            href="mailto:support@infisical.com"
          >
            support@infisical.com
          </a>{" "}
          if the issue persists.
        </p>

        {error && (
          <div className="space-y-4">
            <div>
              <p className="mt-4">Error details:</p>
              <p className="text-xs italic">
                Please provide this error message when contacting support, as it will help us
                diagnose the issue at hand.
              </p>
            </div>
            <p className="max-h-44 w-full overflow-auto text-ellipsis rounded-md bg-mineshaft-700">
              <code className="p-2 text-xs">
                {currentUrl}, {error?.message}
              </code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
  }

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      return <ErrorPage error={error} />;
    }
    return children;
  }
}

const ErrorBoundaryWrapper = ({ children }: ErrorBoundaryProps) => {
  return <ErrorBoundary>{children}</ErrorBoundary>;
};

export default ErrorBoundaryWrapper;
