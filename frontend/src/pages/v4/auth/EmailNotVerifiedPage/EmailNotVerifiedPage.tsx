import { Link } from "@tanstack/react-router";

import { Button } from "@app/components/v4/ui/button";

import { AuthPage } from "../components/AuthPage";

export const EmailNotVerifiedPage = () => (
  <AuthPage
    variant="focused"
    pageTitle="Email Not Verified"
    title="Your email was not verified"
    description="Try again. If the problem continues, contact support@infisical.com."
  >
    <Button asChild variant="accent" size="lg" className="w-full">
      <Link to="/v4/login">Back to login</Link>
    </Button>
  </AuthPage>
);
