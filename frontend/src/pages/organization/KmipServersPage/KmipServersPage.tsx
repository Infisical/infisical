import { KmipServerTab } from "./components";

export const KmipServersPage = () => {
  return (
    <>
      <>
        <title>Infisical | KMIP Servers</title>
        <meta property="og:image" content="/images/message.png" />
      </>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <KmipServerTab />
        </div>
      </div>
    </>
  );
};
