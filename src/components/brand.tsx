import Link from "next/link";
import { cn } from "@/lib/utils";
export function Brand({
  compact = false,
  className,
  href = "/",
}: {
  compact?: boolean;
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("brand", className)}
      aria-label="MODIFY AI home"
    >
      <span className="brand-mark">
        <svg viewBox="0 0 30 30" fill="none" aria-hidden="true">
          <path
            d="M4 22V8l7 7 4-7 4 7 7-7v14"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="square"
          />
          <path
            d="m11 15 4 7 4-7"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span>
          MODIFY<span className="brand-ai"> AI</span>
          <span className="brand-dot">®</span>
        </span>
      )}
    </Link>
  );
}
