import React, { ErrorInfo, ReactNode, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { faBugs, faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const ErrorPage = ({ error }: { error: Error | null }) => {
  const [orgId, setOrgId] = React.useState<string | null>(null);
  const router = useRouter();
  const currentUrl = router?.asPath?.split("?")?.[0];

  // Workaround: Fixes localStorage not being available in the error boundary until the next render.
  useEffect(() => {
    const savedOrgId = localStorage.getItem("orgData.id");

    if (savedOrgId) {
      setOrgId(savedOrgId);
    }
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-mineshaft-900">
      <div className="flex max-w-md flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-8 text-center text-mineshaft-200">
        <FontAwesomeIcon icon={faBugs} className="my-2 inline text-6xl" />
        <p>
          Something went wrong. Please contact{" "}
          <a
            className="inline cursor-pointer text-mineshaft-100 underline decoration-primary-500 underline-offset-4 opacity-80 duration-200 hover:opacity-100"
            target="_blank"
            rel="noopener noreferrer"
            href="mailto:support@infisical.com"
          >
            support@infisical.com
          </a>
          , or{" "}
          <Link passHref href="https://infisical.com/slack">
            <a
              className="inline cursor-pointer text-mineshaft-100 underline decoration-primary-500 underline-offset-4 opacity-80 duration-200 hover:opacity-100"
              target="_blank"
              rel="noopener noreferrer"
            >
              join our Slack community
            </a>
          </Link>{" "}
          if the issue persists.
        </p>

        {orgId && (
          <Button
            className="mt-4"
            size="xs"
            onClick={() =>
              // we need to go to /org/${orgId}/overview, but we need to do a full page reload to ensure that the error the user is facing is properly reset.
              window.location.assign(`/org/${orgId}/overview`)
            }
          >
            <FontAwesomeIcon icon={faHome} className="mr-2" />
            Back To Home
          </Button>
        )}

        {error?.message && (
          <>
            <div className="my-4 h-px w-full bg-mineshaft-600" />
            <p className="thin-scrollbar max-h-44 w-full overflow-auto text-ellipsis rounded-md bg-mineshaft-700 p-2">
              <code className="text-xs">
                {currentUrl}, {error.message}
              </code>
            </p>
          </>
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
