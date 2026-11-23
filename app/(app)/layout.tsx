import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { getBoard } from "@/lib/board";

async function Shell({ children }: { children: React.ReactNode }) {
  const board = await getBoard();
  return (
    <AppShell board={board} authEnabled={Boolean(process.env.SITE_PASSWORD)}>
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-page" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
