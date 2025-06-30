import { faBugs, faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorComponentProps, Link } from "@tanstack/react-router";
import { AxiosError } from "axios";

import { Button } from "@app/components/v2";

export const ErrorPage = ({ error }: ErrorComponentProps) => {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-mineshaft-900">
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
        <Link to="/organization/projects">
          <Button className="mt-4" size="xs">
            <FontAwesomeIcon icon={faHome} className="mr-2" />
            Back To Home
          </Button>
        </Link>
        {error?.message && (
          <>
            <div className="my-4 h-px w-full bg-mineshaft-600" />
            <p className="thin-scrollbar max-h-44 w-full overflow-auto text-ellipsis rounded-md bg-mineshaft-700 p-2">
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
