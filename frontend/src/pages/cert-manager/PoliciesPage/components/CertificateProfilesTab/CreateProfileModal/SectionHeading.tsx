export const SectionHeading = ({ title, description }: { title: string; description: string }) => (
  <div>
    <p className="text-sm font-medium text-foreground">{title}</p>
    <p className="mt-0.5 text-xs text-muted">{description}</p>
  </div>
);
