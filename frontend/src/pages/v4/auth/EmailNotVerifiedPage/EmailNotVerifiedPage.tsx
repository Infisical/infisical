import { Button } from "@infisical/cipher/ui/button";
import { Link } from "@tanstack/react-router";

import { v4Path } from "../../links";
import { AuthPage } from "../components/AuthPage";

export const EmailNotVerifiedPage = () => (
  <AuthPage
    variant="focused"
    pageTitle="Email Not Verified"
    title="Your email was not verified"
    description="Try again. If the problem continues, contact support@infisical.com."
  >
    <Button asChild variant="accent" size="lg" className="w-full">
      <Link to={v4Path("/login")}>Back to login</Link>
    </Button>
  </AuthPage>
);
