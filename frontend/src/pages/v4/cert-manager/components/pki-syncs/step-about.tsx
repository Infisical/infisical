import { Stack } from "@infisical/cipher/ui/layout";
import { SmallText, Text } from "@infisical/cipher/ui/text";

export const PkiSyncStepAbout = ({ paragraphs }: { paragraphs: string[] }) => (
  <Stack gap={8}>
    <Text>What this step does</Text>
    {paragraphs.map((paragraph) => (
      <SmallText key={paragraph} muted>
        {paragraph}
      </SmallText>
    ))}
  </Stack>
);
