import { ErrorState } from "@infisical/cipher/patterns/error-state";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";

import { useErrorContext } from "./errorDetails";
import { RequestAccessAction } from "./RequestAccessAction";

export const V4ErrorPage = ({ error }: ErrorComponentProps) => {
  const { status, projectAccessDenied, projectId, details, homeHref } = useErrorContext(error);
  if (status === 403)
    return (
      <>
        <PageTitle title="Access denied" />
        <ErrorState
          preset="forbidden"
          description={projectAccessDenied ? "You aren't a member of this project." : undefined}
          details={details}
          homeHref={homeHref}
          actions={
            projectAccessDenied && projectId ? (
              <RequestAccessAction projectId={projectId} />
            ) : undefined
          }
        />
      </>
    );
  return (
    <>
      <PageTitle title="Something went wrong" />
      <ErrorState preset="crash" error={error} details={details} homeHref={homeHref} />
    </>
  );
};
