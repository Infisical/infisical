import { Helmet } from "react-helmet";
import { Link } from "@tanstack/react-router";

export const EmailNotVerifiedPage = () => {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28">
      <Helmet>
        <title>Request a New Invite</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Link to="/">
        <div className="mb-4 mt-20 flex justify-center">
          <img src="/images/gradientLogo.svg" className="h-[90px] w-[120px]" alt="Infisical Logo" />
        </div>
      </Link>
      <div className="mx-auto flex w-full flex-col items-center justify-center">
        <h1 className="mb-2 bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
          Your email was not verified
        </h1>
        <p className="w-max justify-center text-center text-sm text-gray-400">
          Please try again. <br /> Note: If it still doesn&apos;t work, please reach out to us at
          support@infisical.com
        </p>
        <div className="mt-6 flex flex-row text-sm text-bunker-400">
          <Link to="/login">
            <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
              Back to Login
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
};
