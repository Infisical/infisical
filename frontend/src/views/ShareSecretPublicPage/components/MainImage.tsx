import Image from "next/image";

export const DragonMainImage = () => {
  return (
    <div className="hidden  flex-1 flex-col items-center justify-center md:block md:items-start md:p-4">
      <Image
        src="/images/dragon-book.svg"
        height={1000}
        width={1413}
        alt="Infisical Dragon - Came to send you a secret!"
      />
    </div>
  );
};
