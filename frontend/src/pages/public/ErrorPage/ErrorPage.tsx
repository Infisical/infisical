import { useEffect } from "react";
import { faBugs, faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorComponentProps, Link } from "@tanstack/react-router";
import { AxiosError } from "axios";

import { Button, Lottie } from "@app/components/v2";

import { ProjectAccessError } from "./components";

export const ErrorPage = ({ error }: ErrorComponentProps) => {
  const isDeploymentSkew =
    error instanceof TypeError &&
    error.message.includes("error loading dynamically imported module");

  const reloadCount = parseInt(sessionStorage.getItem("vitePreloadErrorCount") || "0", 10);

  useEffect(() => {
    if (isDeploymentSkew && reloadCount <= 3) {
      const timeout = setTimeout(() => {
        clearTimeout(timeout);
        sessionStorage.setItem("vitePreloadErrorCount", (reloadCount + 1).toString());
        window.location.reload();
      }, 10000);
    }
  }, [isDeploymentSkew]);

  if (
    error instanceof AxiosError &&
    error.status === 403 &&
    error.response?.data?.error === "User not a part of the specified project"
  ) {
    return <ProjectAccessError />;
  }

  if (isDeploymentSkew && reloadCount <= 3) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bunker-800">
        <Lottie isAutoPlay icon="infisical_loading" className="h-32 w-32" />
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-bunker-800">
      <div className="flex max-w-3xl flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-8 text-center text-mineshaft-200">
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
          <a
            href="https://infisical.com/slack"
            className="inline cursor-pointer text-mineshaft-100 underline decoration-primary-500 underline-offset-4 opacity-80 duration-200 hover:opacity-100"
            target="_blank"
            rel="noopener noreferrer"
          >
            join our Slack community
          </a>{" "}
          if the issue persists.
        </p>
        <Link to="/">
          <Button className="mt-4" size="xs">
            <FontAwesomeIcon icon={faHome} className="mr-2" />
            Back To Home
          </Button>
        </Link>
        {error?.message && (
          <>
            <div className="my-4 h-px w-full bg-mineshaft-600" />
            <p className="max-h-44 thin-scrollbar w-full overflow-auto rounded-md bg-mineshaft-700 p-2 text-ellipsis">
              <code className="text-xs">
                {window.location.pathname}
                <br />
                {error.name}
                <br />
                {error.message}
              </code>
              <code className="font-mono text-xs">
                {error instanceof AxiosError && (
                  <div className="mt-4">{JSON.stringify(error.response?.data)}</div>
                )}
              </code>
            </p>
          </>
        )}
      </div>
    </div>
  );
};
