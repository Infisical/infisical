import { Stack } from "@infisical/cipher/ui/layout";

export const PkiSyncStepAbout = ({ paragraphs }: { paragraphs: string[] }) => (
  <Stack gap={8}>
    {paragraphs.map((paragraph) => (
      <span key={paragraph}>{paragraph}</span>
    ))}
  </Stack>
);
