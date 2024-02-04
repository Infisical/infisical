import Head from "next/head";
import Image from "next/image";
import Link from "next/link";

export default function Custom404() {
  return (
    <div className='bg-bunker-800 md:h-screen flex flex-col justify-between'>
      <Head>
        <title>Infisical | Page Not Found</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <div className='flex flex-col items-center justify-center text-gray-200 h-screen w-screen'>
        <p className='text-4xl mt-32'>Oops, something went wrong</p>
        <p className='mt-2 mb-1 text-lg'>
          Think this is a mistake? Email{" "}
          <a
            className='text-primary underline underline-offset-4'
            href='mailto:team@infisical.com'
          >
            team@infisical.com
          </a>{" "}
          and we`ll fix it!{" "}
        </p>
        <Link href='/dashboard'>
          <div className="mt-8 bg-mineshaft-500 py-2 px-4 rounded-md hover:bg-primary diration-200 hover:text-black font-semibold cursor-default">
            Go to Dashboard
          </div>
        </Link>
        <Image
          src='/images/dragon-404.svg'
          height={554}
          width={942}
          alt='infisical dragon - page not found'
         />
      </div>
    </div>
  );
}
