import { projectSections, Shell, useCrumbs } from "./shared";

export default function ShellOnly() {
  const { org, product, project } = useCrumbs();
  return <Shell sections={projectSections} current="secrets" crumbs={[org, product, project]} />;
}
