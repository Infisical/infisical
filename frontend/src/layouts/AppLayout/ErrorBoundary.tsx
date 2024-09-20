import React, { ErrorInfo, ReactNode } from "react";
import Link from "next/link";
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

  error = new Error(
    "e26eabc714f1/secrets/dev, error on line 45: Cannot read property 'split' of undefinede26eabc714f1/secrets/dev, error on line 45: Cannot read property 'split' of undefinede26eabc714f1/secrets/dev, error on line 45: Cannot read property 'split' of undefinede26eabc714f1/secrets/dev, error on line 45: Cannot read property 'split' of undefinede26eabc714f1/secrets/dev, error on line 45: Cannot read property 'split' of undefinede26eabc714f1/secrets/dev, error on line 45: Cannot read property 'split' of undefined"
  );

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-mineshaft-900">
      <div className="flex max-w-md flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 text-center text-mineshaft-200">
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

        <div className="my-4 h-px w-full bg-mineshaft-600" />

        {error?.message && (
          <div className="space-y-2">
            <div>
              <p>Error details:</p>
              <p className="text-xs italic opacity-70">
                Please provide this error message when contacting support, as it will help us
                diagnose the issue at hand.
              </p>
            </div>
            <p className="max-h-44 w-full overflow-auto text-ellipsis rounded-md bg-mineshaft-700">
              <code className="p-2 text-xs">
                {currentUrl}, {error.message}
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

    if (!hasError) {
      return <ErrorPage error={error} />;
    }
    return children;
  }
}

const ErrorBoundaryWrapper = ({ children }: ErrorBoundaryProps) => {
  return <ErrorBoundary>{children}</ErrorBoundary>;
};

export default ErrorBoundaryWrapper;
