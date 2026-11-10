import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/sheet";

const PlanHeader = ({ plan }: { plan: string }) => (
  <UI.SheetHeader>
    <UI.SheetTitle>Upgrade to {plan}</UI.SheetTitle>
    <UI.SheetDescription>
      You pay the difference for the rest of this billing period.
    </UI.SheetDescription>
  </UI.SheetHeader>
);

const PlanFooter = () => (
  <UI.SheetFooter>
    <UI.SheetClose asChild>
      <Button variant="primary">Upgrade</Button>
    </UI.SheetClose>
  </UI.SheetFooter>
);

const UpgradeView = ({ plan }: { plan: string }) => (
  <UI.SheetSections header={<PlanHeader plan={plan} />} footer={<PlanFooter />}>
    <UI.SheetBody>
      <ul>
        {Array.from({ length: 60 }, (_, index) => (
          <li key={index}>
            {plan} feature {index + 1}
          </li>
        ))}
      </ul>
    </UI.SheetBody>
  </UI.SheetSections>
);

export default function Example() {
  return (
    <UI.Sheet>
      <UI.SheetTrigger asChild>
        <Button variant="outline">Upgrade plan</Button>
      </UI.SheetTrigger>
      <UI.SheetContent>
        <UpgradeView plan="Pro" />
      </UI.SheetContent>
    </UI.Sheet>
  );
}
