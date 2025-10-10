import { Helmet } from "react-helmet";
import { Link } from "@tanstack/react-router";

export const NotFoundPage = () => {
  return (
    <div className="bg-bunker-800 flex flex-col justify-between md:h-screen">
      <Helmet>
        <title>Infisical | Page Not Found</title>
      </Helmet>
      <div className="flex h-screen w-screen flex-col items-center justify-center text-gray-200">
        <p className="mt-32 text-4xl">Oops, something went wrong</p>
        <p className="mb-1 mt-2 text-lg">
          Think this is a mistake? Email{" "}
          <a className="text-primary underline underline-offset-4" href="mailto:team@infisical.com">
            team@infisical.com
          </a>{" "}
          and we`ll fix it!{" "}
        </p>
        <Link to="/organization/projects">
          <div className="diration-200 bg-mineshaft-500 hover:bg-primary mt-8 cursor-default rounded-md px-4 py-2 font-medium hover:text-black">
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
