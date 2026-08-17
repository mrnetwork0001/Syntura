import React from "react";

/**
 * The Syntura mark: terminal brackets around a cursor - a cyan `[`, a cyan
 * caret, and a white `]`. Vector recreation of brand/syntura-logo.png so it
 * stays crisp at any size with a transparent background.
 */
export default function BrandMark({ size = 20, className, title = "Syntura" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={className}
    >
      {/* left bracket */}
      <g fill="#22d3ee">
        <rect x="14" y="15" width="9.5" height="5" />
        <rect x="14" y="15" width="5" height="34" />
        <rect x="14" y="44" width="9.5" height="5" />
        {/* cursor */}
        <rect x="29.5" y="21" width="5" height="22" />
      </g>
      {/* right bracket */}
      <g fill="#f1f5f9">
        <rect x="40.5" y="15" width="9.5" height="5" />
        <rect x="45" y="15" width="5" height="34" />
        <rect x="40.5" y="44" width="9.5" height="5" />
      </g>
    </svg>
  );
}
