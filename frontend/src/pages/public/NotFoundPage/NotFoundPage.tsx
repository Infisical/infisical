import { Helmet } from "react-helmet";
import { Link } from "@tanstack/react-router";

export const NotFoundPage = () => {
  return (
    <div className="flex flex-col justify-between bg-bunker-800 md:h-screen">
      <Helmet>
        <title>Infisical | Page Not Found</title>
      </Helmet>
      <div className="flex h-screen w-screen flex-col items-center justify-center text-gray-200">
        <p className="mt-32 text-4xl">Oops, something went wrong</p>
        <p className="mt-2 mb-1 text-lg">
          Think this is a mistake? Email{" "}
          <a className="text-primary underline underline-offset-4" href="mailto:team@infisical.com">
            team@infisical.com
          </a>{" "}
          and we`ll fix it!{" "}
        </p>
        <Link to="/">
          <div className="diration-200 mt-8 cursor-default rounded-md bg-mineshaft-500 px-4 py-2 font-medium hover:bg-primary hover:text-black">
            Go to Dashboard
          </div>
        </Link>
        <img
          src="/images/dragon-404.svg"
          height={554}
          width={942}
          alt="infisical dragon - page not found"
        />
      </div>
    </div>
  );
};
