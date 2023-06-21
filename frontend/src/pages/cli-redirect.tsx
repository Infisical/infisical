import Head from "next/head";
import Image from "next/image";

export default function CliRedirect() {
  return (
    <div className='bg-bunker-800 md:h-screen flex flex-col justify-between'>
      <Head>
        <title>Infisical Cli | Login Successful!</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <div className='flex flex-col items-center justify-center text-gray-200 h-screen w-screen'>
        <p className='text-4xl mt-32'>Head back to your terminal!</p>
        <p className='mt-2 mb-1 text-lg'>
          You&apos;ve successfully logged into infisical-cli
        </p>
      </div>
    </div>
  );
}
