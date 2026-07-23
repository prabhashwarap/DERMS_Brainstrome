import { cn } from "@/lib/utils";

/**
 * Oversight lockup — the supplied brand artwork.
 *
 * Two files, one per surface: the indigo mark for light backgrounds, the white
 * one for dark. Both render and CSS picks the right one off `data-theme` on the
 * root, so the swap costs no JavaScript and cannot flash the wrong artwork
 * between paint and hydration.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <>
      <img
        src="/oversight-logo-indigo.png"
        alt="Oversight"
        width={2285}
        height={690}
        className={cn("logo-on-light w-auto", className)}
      />
      <img
        src="/oversight-logo-white.png"
        alt="Oversight"
        width={2285}
        height={690}
        className={cn("logo-on-dark w-auto", className)}
      />
    </>
  );
}
