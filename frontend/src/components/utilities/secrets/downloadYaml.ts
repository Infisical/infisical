// import YAML from 'yaml';
// import { YAMLSeq } from 'yaml/types';

import { SecretDataProps } from "public/data/frequentInterfaces";

// import { envMapping } from "../../../public/data/frequentConstants";
// import checkOverrides from './checkOverrides';

/**
 * This function downloads the secrets as a .yml file
 * @param {object} obj
 * @param {SecretDataProps[]} obj.data - secrets that we want to download
 * @param {string} obj.env - used for naming the file
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const downloadYaml = async ({ data, env }: { data: SecretDataProps[]; env: string }) => {
  // if (!data) return;
  // const doc = new YAML.Document();
  // doc.contents = new YAMLSeq();
  // const secrets = await checkOverrides({ data });
  // secrets.forEach((secret) => {
  //   const pair = YAML.createNode({ [secret.key]: secret.value });
  //   pair.commentBefore = secret.comment
  //     .split('\n')
  //     .map((line) => (line ? ' '.concat(line) : ''))
  //     .join('\n');
  //   doc.add(pair);
  // });
  // const file = doc
  //   .toString()
  //   .split('\n')
  //   .map((line) => (line.startsWith('-') ? line.replace('- ', '') : line))
  //   .join('\n');
  // const blob = new Blob([file]);
  // const fileDownloadUrl = URL.createObjectURL(blob);
  // const alink = document.createElement('a');
  // alink.href = fileDownloadUrl;
  // alink.download = envMapping[env] + '.yml';
  // alink.click();
};

export default downloadYaml;
