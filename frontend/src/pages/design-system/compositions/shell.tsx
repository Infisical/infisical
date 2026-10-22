import { Shell, useCrumbs } from "./shared";

export default function ShellOnly() {
  const { org, product, project } = useCrumbs();
  return <Shell level="project" current="secrets" crumbs={[org, product, project]} />;
}
