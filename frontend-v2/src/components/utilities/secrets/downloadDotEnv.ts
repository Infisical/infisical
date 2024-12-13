import { SecretDataProps } from "public/data/frequentInterfaces";

import checkOverrides from "./checkOverrides";

/**
 * This function downloads the secrets as a .env file
 * @param {object} obj
 * @param {SecretDataProps[]} obj.data - secrets that we want to download
 * @param {string} obj.env - the environment which we're downloading (used for naming the file)
 */
const downloadDotEnv = async ({ data, env }: { data: SecretDataProps[]; env: string }) => {
  if (!data) return;
  const secrets = await checkOverrides({ data });

  const file = secrets!
    .map(
      (item: SecretDataProps) =>
        `${
          item.comment
            ? `${item.comment
                .split("\n")
                .map((comment) => "# ".concat(comment))
                .join("\n")}\n`
            : ""
        }${[item.key, item.value].join("=")}`
    )
    .join("\n");

  const blob = new Blob([file]);
  const fileDownloadUrl = URL.createObjectURL(blob);
  const alink = document.createElement("a");
  alink.href = fileDownloadUrl;
  alink.download = `${env}.env`;
  alink.click();
};

export default downloadDotEnv;
