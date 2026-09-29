import { Helmet } from "react-helmet";
import { LockKeyhole } from "lucide-react";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

import { ShareSecretForm } from "./components";

export const ShareSecretPage = () => {
  return (
    <>
      <Helmet>
        <title>Securely Share Secrets | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Securely Share Secrets" />
        <meta
          name="og:description"
          content="Create an encrypted, expiring link for sensitive information."
        />
      </Helmet>
      <AuthPageLayout variant="focused" contentClassName="max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>
              <LockKeyhole className="size-4" />
              Share a Secret
            </CardTitle>
            <CardDescription>
              Create an encrypted link that expires on your terms. The secret stays masked by
              default.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-y-4">
            <ShareSecretForm isPublic />
          </CardContent>
        </Card>
      </AuthPageLayout>
    </>
  );
};
