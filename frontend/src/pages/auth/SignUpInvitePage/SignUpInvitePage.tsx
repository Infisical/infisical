import { useSearch } from "@tanstack/react-router";

import { SignUpPage } from "../SignUpPage/SignUpPage";

export const SignupInvitePage = () => {
  const search = useSearch({ from: "/_restrict-login-signup/signupinvite" });
  const email = (search.to as string)?.replace(" ", "+").trim();

  return <SignUpPage invite={{ email }} />;
};
