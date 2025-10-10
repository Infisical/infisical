import { faBugs, faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorComponentProps, Link } from "@tanstack/react-router";
import { AxiosError } from "axios";

import { Button } from "@app/components/v2";

import { ProjectAccessError } from "./components";

export const ErrorPage = ({ error }: ErrorComponentProps) => {
  if (
    error instanceof AxiosError &&
    error.status === 403 &&
    error.response?.data?.error === "User not a part of the specified project"
  ) {
    return <ProjectAccessError />;
  }

  return (
    <div className="bg-mineshaft-900 flex h-screen w-screen items-center justify-center">
      <div className="border-mineshaft-600 bg-mineshaft-800 text-mineshaft-200 flex max-w-3xl flex-col rounded-md border p-8 text-center">
        <FontAwesomeIcon icon={faBugs} className="my-2 inline text-6xl" />
        <p>
          Something went wrong. Please contact{" "}
          <a
            className="text-mineshaft-100 decoration-primary-500 inline cursor-pointer underline underline-offset-4 opacity-80 duration-200 hover:opacity-100"
            target="_blank"
            rel="noopener noreferrer"
            href="mailto:support@infisical.com"
          >
            support@infisical.com
          </a>
          , or{" "}
          <a
            href="https://infisical.com/slack"
            className="text-mineshaft-100 decoration-primary-500 inline cursor-pointer underline underline-offset-4 opacity-80 duration-200 hover:opacity-100"
            target="_blank"
            rel="noopener noreferrer"
          >
            join our Slack community
          </a>{" "}
          if the issue persists.
        </p>
        <Link to="/organization/projects">
          <Button className="mt-4" size="xs">
            <FontAwesomeIcon icon={faHome} className="mr-2" />
            Back To Home
          </Button>
        </Link>
        {error?.message && (
          <>
            <div className="bg-mineshaft-600 my-4 h-px w-full" />
            <p className="thin-scrollbar bg-mineshaft-700 max-h-44 w-full overflow-auto text-ellipsis rounded-md p-2">
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
