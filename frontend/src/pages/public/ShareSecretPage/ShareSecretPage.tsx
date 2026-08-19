import { Helmet } from "react-helmet";
import { LockKeyhole } from "lucide-react";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { AuthPageHeader } from "@app/components/auth/AuthPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

import { ShareSecretForm } from "./components";

export const ShareSecretPage = () => {
  return (
    <div className="relative flex max-h-screen min-h-screen flex-col overflow-y-auto bg-bunker-800 px-4 text-foreground scheme-dark">
      <AuthPageBackground />
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
      <AuthPageHeader />

      <Card className="z-50 m-auto w-full max-w-xl">
        <CardHeader>
          <CardTitle>
            <LockKeyhole className="size-4 text-project" />
            Share a Secret
          </CardTitle>
          <CardDescription>
            Create an encrypted link that expires on your terms. The secret stays masked by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-y-4">
          <ShareSecretForm isPublic />
        </CardContent>
      </Card>

      <AuthPageFooter />
    </div>
  );
};
