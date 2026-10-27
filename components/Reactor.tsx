"use client";

import { useId } from "react";

export type CoreMode = "idle" | "wake" | "listening" | "thinking" | "searching" | "speaking";

/** Taylor's energy core. "big" on the home screen, "mini" in the nav pill. Always in motion. */
export function Reactor({ variant, mode }: { variant: "big" | "mini"; mode: CoreMode }) {
  const id = useId().replace(/:/g, "");
  const big = variant === "big";
  return (
    <span className={`reactor ${variant} m-${mode}`} aria-hidden="true">
      <svg viewBox="0 0 400 400">
        <defs>
          <radialGradient id={`c${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor="var(--accent)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <filter id={`g${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={big ? 6 : 9} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {big && (
          <g className="r-outer">
            <circle cx="200" cy="200" r="190" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.25" />
            <circle cx="200" cy="200" r="184" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="40 14 4 14" opacity="0.4" />
            {[0, 90, 180, 270].map((a) => (
              <circle key={a} cx="200" cy="10" r="4" fill="var(--accent)" transform={`rotate(${a} 200 200)`} />
            ))}
          </g>
        )}
        <g className="r-dots">
          <circle cx="200" cy="200" r="172" fill="none" stroke="var(--accent)" strokeWidth={big ? 1 : 3} strokeDasharray={big ? "2 9" : "6 16"} opacity="0.55" />
        </g>
        <g className="r-ring">
          <circle
            cx="200"
            cy="200"
            r="146"
            fill="none"
            stroke="var(--accent)"
            strokeWidth={big ? 20 : 34}
            strokeDasharray="64.4 12"
            transform="rotate(-86 200 200)"
            filter={`url(#g${id})`}
          />
        </g>
        {big && (
          <g className="r-counter">
            <circle cx="200" cy="200" r="122" fill="none" stroke="#eaf6ff" strokeWidth="2" strokeDasharray="120 30 10 30" opacity="0.5" />
          </g>
        )}
        <circle className="r-halo" cx="200" cy="200" r="104" fill={`url(#c${id})`} />
        <circle cx="200" cy="200" r="104" fill="none" stroke="var(--accent)" strokeWidth={big ? 3 : 8} filter={`url(#g${id})`} />
      </svg>
      <img src="/taylor-mark.png" alt="" draggable={false} />
    </span>
  );
}
