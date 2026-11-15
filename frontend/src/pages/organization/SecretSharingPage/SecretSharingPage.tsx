import { PageTitle } from "@app/components/PageTitle";
import { PageHeader } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ShareSecretSection } from "./ShareSecretSection";

export const SecretSharingPage = () => {
  return (
    <>
      <PageTitle title="Secret Sharing" />
      <link rel="icon" href="/infisical.ico" />
      <meta property="og:image" content="/images/message.png" />
      <meta property="og:title" content="Secret Sharing" />
      <meta
        name="og:description"
        content="Share sensitive information through secure, expiring links."
      />
      <div>
        <div className="mx-auto flex w-full max-w-8xl flex-col bg-page text-foreground-inverse">
          <PageHeader
            scope={ProjectType.SecretManager}
            title="Secret Sharing"
            description="Send and request sensitive information through secure, expiring links."
          />
          <ShareSecretSection />
        </div>
      </div>
    </>
  );
};
