import { Helmet } from "react-helmet";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { AuthPageHeader } from "@app/components/auth/AuthPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

import { ShareSecretForm } from "./components";

export const ShareSecretPage = () => {
  return (
    <div className="relative flex max-h-screen min-h-screen flex-col overflow-y-auto bg-linear-to-tr from-card via-bunker-900 to-card px-4">
      <AuthPageBackground />
      <Helmet>
        <title>Securely Share Secrets | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="" />
        <meta name="og:description" content="" />
      </Helmet>
      <AuthPageHeader />

      <Card className="z-50 m-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Share a Secret</CardTitle>
          <CardDescription>Create an encrypted link that expires automatically.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-y-4">
          <ShareSecretForm isPublic />
        </CardContent>
      </Card>

      <AuthPageFooter />
    </div>
  );
};
