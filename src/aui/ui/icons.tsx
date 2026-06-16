/* ------------------------------------------------------------------
 * Shared inline SVG icons for the AUI blocks.
 *
 * These match the project's design system (Phosphor-style 24×24 stroke
 * glyphs) but are hand-inlined rather than pulled from a dependency, so
 * the AUI block chrome carries no icon-library weight. Block-local icons
 * (ExpandIcon, ChevronIcon) stay in their single consumer; icons shared
 * by more than one block live here to avoid divergent copies.
 * ----------------------------------------------------------------*/

/** Download / export-to-CSV glyph. Shared by chart-block and table-block. */
export function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
