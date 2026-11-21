import { ErrorState } from "@infisical/cipher/patterns/error-state";

import { PageTitle } from "@app/components/PageTitle";

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
