import { Link } from "@tanstack/react-router";

import { Button } from "@app/components/v4/ui/button";

import { AuthPage } from "../components/AuthPage";

export const ProviderErrorPage = () => (
  <AuthPage
    pageTitle="Login Failed"
    title="We couldn't sign you in"
    description="Your sign-in provider didn't complete the login. Go back and try again."
  >
    <Button asChild variant="accent" size="lg" className="w-full">
      <Link to="/v4/login">Back to login</Link>
    </Button>
  </AuthPage>
);
