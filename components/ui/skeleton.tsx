export function Skel({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-xl ${className}`} />;
}

/** Placeholder shown for a split second while a page's data streams in. */
export function PageSkeleton({ variant = "detail" }: { variant?: "detail" | "list" }) {
  if (variant === "list") {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading">
        <Skel className="h-28" />
        <Skel className="h-12" />
        <Skel className="h-[520px]" />
      </div>
    );
  }
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skel className="h-4 w-48" />
        <Skel className="h-9 w-80" />
        <Skel className="h-12 w-[520px] max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skel className="h-[520px] xl:col-span-2" />
        <div className="space-y-6">
          <Skel className="h-64" />
          <Skel className="h-60" />
        </div>
      </div>
      <Skel className="h-96" />
    </div>
  );
}
