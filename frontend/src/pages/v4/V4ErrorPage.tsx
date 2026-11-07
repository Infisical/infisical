import type { ErrorComponentProps } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { ErrorState } from "@app/components/v4/patterns/error-state";

import { useErrorContext } from "./errorDetails";

export const V4ErrorPage = ({ error }: ErrorComponentProps) => {
  const { status, projectAccessDenied, details, homeHref } = useErrorContext(error);
  let description: string | undefined;
  if (projectAccessDenied)
    description = "You aren't a member of this project. Ask a project admin to add you.";
  else if (status === 403) description = "You don't have permission to view this page.";
  return (
    <>
      <PageTitle title={status === 403 ? "Access denied" : "Something went wrong"} />
      <ErrorState
        preset="crash"
        description={description}
        error={error}
        details={details}
        homeHref={homeHref}
      />
    </>
  );
};
