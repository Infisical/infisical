import { PageTitle } from "@app/components/PageTitle";
import { ErrorState } from "@app/components/v4/patterns/error-state";

import { useErrorContext } from "./errorDetails";

export const V4NotFoundPage = () => {
  const { homeHref } = useErrorContext();
  return (
    <>
      <PageTitle title="Page not found" />
      <ErrorState preset="not-found" homeHref={homeHref} />
    </>
  );
};
