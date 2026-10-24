import { Avatar, AvatarGroup } from "@app/components/v4/ui/avatar";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const members = ["Ada Morgan", "Sam Lee", "Mina Patel", "Rory Chen", "Eli Ford"];
export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="Group of five, max 3">
        <AvatarGroup max={3} label="Project members">
          {members.map((name) => (
            <Avatar key={name} name={name} />
          ))}
        </AvatarGroup>
      </ExampleCell>
      <ExampleCell label="Small group">
        <AvatarGroup size={24} label="Reviewers">
          {members.slice(0, 3).map((name) => (
            <Avatar key={name} name={name} />
          ))}
        </AvatarGroup>
      </ExampleCell>
    </ExampleGrid>
  );
}
