import { AccessProvider } from "./context";
import { AccessPage } from "./page";
import { useAccessView } from "./views";

export default function Access() {
  const { view, scenario } = useAccessView();
  return (
    <AccessProvider key={`${view.value}-${scenario}`} scenario={scenario} start={view.start}>
      <AccessPage />
    </AccessProvider>
  );
}
