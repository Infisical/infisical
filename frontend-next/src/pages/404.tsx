import Head from "next/head";
import Image from "next/image";
import Link from "next/link";

export default function Custom404() {
  return (
    <div className="flex flex-col justify-between bg-bunker-800 md:h-screen">
      <Head>
        <title>Infisical | Page Not Found</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex h-screen w-screen flex-col items-center justify-center text-gray-200">
        <p className="mt-32 text-4xl">Oops, something went wrong</p>
        <p className="mt-2 mb-1 text-lg">
          Think this is a mistake? Email{" "}
          <a className="text-primary underline underline-offset-4" href="mailto:team@infisical.com">
            team@infisical.com
          </a>{" "}
          and we`ll fix it!{" "}
        </p>
        <Link href="/dashboard">
          <div className="diration-200 mt-8 cursor-default rounded-md bg-mineshaft-500 py-2 px-4 font-semibold hover:bg-primary hover:text-black">
            Go to Dashboard
          </div>
        </Link>
        <Image
          src="/images/dragon-404.svg"
          height={554}
          width={942}
          alt="infisical dragon - page not found"
        />
      </div>
    </div>
  );
}
