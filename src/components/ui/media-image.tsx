import Image from "next/image";
import type { CSSProperties } from "react";

// Private media must be requested by the browser with its session cookie, not by the public image optimizer.
export function MediaImage({
  src,
  alt,
  className,
  style,
  priority = false,
}: {
  src?: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
}) {
  if (!src) return <span role="img" aria-label={alt} className={className} />;
  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      style={style}
      width={1200}
      height={1600}
      priority={priority}
      unoptimized={src.startsWith("/api/")}
    />
  );
}
