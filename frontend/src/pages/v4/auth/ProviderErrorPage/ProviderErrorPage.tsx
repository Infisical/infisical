import { Button } from "@infisical/cipher/ui/button";
import { Link } from "@tanstack/react-router";

import { v4Path } from "../../links";
import { AuthPage } from "../components/AuthPage";

export const ProviderErrorPage = () => (
  <AuthPage
    variant="focused"
    pageTitle="Login Failed"
    title="We couldn't sign you in"
    description="Your sign-in provider didn't complete the login. Go back and try again."
  >
    <Button asChild variant="accent" size="lg" className="w-full">
      <Link to={v4Path("/login")}>Back to login</Link>
    </Button>
  </AuthPage>
);
