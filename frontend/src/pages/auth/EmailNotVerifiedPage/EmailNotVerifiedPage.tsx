import { Helmet } from "react-helmet";
import { Link } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { Button, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

export const EmailNotVerifiedPage = () => {
  return (
    <AuthPageLayout>
      <Helmet>
        <title>Email Not Verified</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <AuthPagePanel>
        <CardHeader className="mb-6 gap-2 text-center">
          <CardTitle>Your email was not verified</CardTitle>
          <CardDescription>
            Please try again. If the problem continues, contact support@infisical.com.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="project" size="lg" isFullWidth>
            <Link to="/login">Back to Login</Link>
          </Button>
        </CardContent>
      </AuthPagePanel>
    </AuthPageLayout>
  );
};
