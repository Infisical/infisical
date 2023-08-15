import Head from "next/head";
import Image from "next/image";

export default function CliRedirect() {
  return (
    <div className='bg-bunker-800 md:h-screen flex flex-col justify-between'>
      <Head>
        <title>Infisical CLI | Login Successful!</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <div className='flex flex-col items-center justify-center text-gray-200 h-screen w-screen'>
        <div className="mb-8 flex justify-center">
          <Image src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical Logo" />
        </div>
        <p className='text-3xl font-medium text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 text-center'>Head back to your terminal</p>
        <p className='mb-1 text-lg text-light text-mineshaft-400'>
          You&apos;ve successfully logged in to the Infisical CLI
        </p>
      </div>
    </div>
  );
}
