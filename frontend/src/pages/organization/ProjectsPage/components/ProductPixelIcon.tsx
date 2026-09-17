import { ProjectType } from "@app/hooks/api/projects/types";

const PRODUCT_ICON_PATHS: Record<ProjectType, string> = {
  [ProjectType.SecretManager]:
    "M6 6h9v3H6zM3 9h6v3H3zM12 9h6v3H12zM15 12h3v1H15zM15 13h15v3H15zM3 12h3v6H3zM15 16h3v2H15zM3 18h6v3H3zM12 18h6v3H12zM21 16h3v7H21zM27 16h3v7H27zM6 21h9v3H6z",
  [ProjectType.CertificateManager]:
    "M3 3h18v3H3zM15 6h9v6H15zM8 9h5v3H8zM21 12h3v3H21zM8 15h7v3H8zM19 17h9v3H19zM8 21h5v3H8zM16 20h6v6H16zM25 20h6v6H25zM3 6h3v21H3zM19 26h9v3H19zM3 27h13v3H3zM19 29h3v2H19zM25 29h3v2H25z",
  [ProjectType.KMS]:
    "M12 3h9v3H12zM9 6h6v3H9zM18 6h6v3H18zM9 9h3v4H9zM21 9h3v4H21zM6 13h21v3H6zM3 16h6v3H3zM24 16h6v3H24zM14 18h5v3H14zM3 19h3v5H3zM27 19h3v5H27zM15 21h3v3H15zM3 24h6v3H3zM24 24h6v3H24zM6 27h21v3H6z",
  [ProjectType.SecretScanning]:
    "M3 3h11v3H3zM19 3h11v3H19zM15 7h3v3H15zM3 6h3v8H3zM27 6h3v8H27zM12 12h9v3H12zM7 15h3v3H7zM12 15h3v3H12zM18 15h3v3H18zM23 15h3v3H23zM12 18h9v3H12zM15 23h3v3H15zM3 19h3v8H3zM27 19h3v8H27zM3 27h11v3H3zM19 27h11v3H19z",
  [ProjectType.PAM]:
    "M21 3h9v3H21zM5 5h9v3H5zM5 8h3v3H5zM11 8h3v3H11zM27 6h3v7H27zM5 11h9v3H5zM25 13h5v3H25zM5 17h9v3H5zM21 6h3v15H21zM11 20h6v1H11zM2 20h6v3H2zM11 21h13v2H11zM14 23h10v1H14zM2 23h3v3H2zM14 24h3v2H14zM27 16h3v11H27zM21 24h3v3H21zM2 26h15v3H2zM21 27h9v3H21z",
  [ProjectType.AgentVault]:
    "M3 3h27v3H3zM3 6h3v3H3zM10 7h13v3H10zM2 9h4v3H2zM7 10h6v3H7zM20 10h6v3H20zM12 14h3v3H12zM18 14h3v3H18zM7 13h3v7H7zM23 13h3v7H23zM3 12h3v9H3zM14 19h5v3H14zM7 20h6v3H7zM20 20h6v3H20zM2 21h4v3H2zM10 23h13v3H10zM27 6h3v21H27zM3 24h3v3H3zM3 27h27v3H3z"
};

type Props = {
  type: ProjectType;
  className: string;
};

export const ProductPixelIcon = ({ type, className }: Props) => (
  <svg
    width={24}
    height={24}
    viewBox="0 0 32 32"
    fill="currentColor"
    shapeRendering="geometricPrecision"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    <path d={PRODUCT_ICON_PATHS[type]} />
  </svg>
);
