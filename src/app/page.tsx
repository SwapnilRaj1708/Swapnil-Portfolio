import { Container } from "@/components/layout/container";
import { StatusChip } from "@/components/ui/status-chip";
import { site } from "@/content/site";

export default function Home() {
  return (
    <Container grid className="min-h-first-screen content-center py-section">
      <div className="col-span-full flex flex-col items-start gap-6 lg:col-span-7">
        <h1 className="font-heading text-display font-medium text-text">{site.name}</h1>
        <p className="label-mono text-text-muted">{site.role}</p>
        <p className="max-w-prose text-xl text-text">{site.pitch}</p>
        <StatusChip className="mt-4">{site.availability}</StatusChip>
      </div>
    </Container>
  );
}
