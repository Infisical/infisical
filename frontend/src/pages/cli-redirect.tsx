import Head from "next/head";
import Image from "next/image";

export default function CliRedirect() {
  return (
    <div className="flex flex-col justify-between bg-bunker-800 md:h-screen">
      <Head>
        <title>Infisical CLI | Login Successful!</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex h-screen w-screen flex-col items-center justify-center text-gray-200">
        <div className="mb-8 flex justify-center">
          <Image src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical Logo" />
        </div>
        <p className="bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-3xl font-medium text-transparent">
          Head back to your terminal
        </p>
        <p className="text-light mb-1 text-lg text-mineshaft-400">
          You&apos;ve successfully logged in to the Infisical CLI
        </p>
      </div>
    </div>
  );
}
