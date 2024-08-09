import Image from "next/image";
import Link from "next/link";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { CardTitle } from "../v2";

export interface IntegrationCardHeadingProps {
  imageSrc: string;
  integrationName: string;
  imageAlt?: string;
  subTitle: string;
  docsLink: string;
  logoWidth?: number;
  logoHeight?: number;
}

export default function IntegrationCardHeading({imageSrc, imageAlt, integrationName, subTitle, docsLink, logoWidth, logoHeight}: IntegrationCardHeadingProps) {
  const logoAlt = imageAlt ?? `${integrationName} logo`

  return (
    <CardTitle className="px-6 text-left text-xl" subTitle={subTitle}>
      <div className="flex flex-row items-center">
        <div className="inline-flex items-center">
          <Image
            src={imageSrc}
            height={logoHeight}
            width={logoWidth}
            alt={logoAlt}
          />
        </div>
        <span className="ml-2.5">{integrationName} Integration</span>
        <Link href={docsLink} passHref>
          <a target="_blank" rel="noopener noreferrer">
            <div className="ml-2 mb-1 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
              <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
              Docs
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="ml-1.5 mb-[0.07rem] text-xxs"
              />
            </div>
          </a>
        </Link>
      </div>
    </CardTitle>
  );
}
