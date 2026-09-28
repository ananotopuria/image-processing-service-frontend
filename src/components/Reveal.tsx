import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

// Content stays visible if observation is unavailable. Only animate once per mount.
export default function Reveal({ children, className = "", delay = 0 }: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      element.dataset.revealed = "true";
      observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={`specimen-reveal min-w-0 ${className}`}
    style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>{children}</div>;
}
