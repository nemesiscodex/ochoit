import { createFileRoute } from "@tanstack/react-router";

import { WorkstationShell } from "@/components/workstation-shell";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return <WorkstationShell />;
}
