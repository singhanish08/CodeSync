/**
 * Popover placement geometry, extracted so it can be unit-tested without a
 * browser. The toolbar the Share button lives in sits directly above the
 * resizable AI panel, so a naively anchored dropdown slides across the panel
 * as the window or the panel split changes. These rules keep the popover below
 * the button and left of the panel at all sizes.
 */

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PopoverPlacement {
  top: number;
  left: number;
  /** Width, shrunk from POPOVER_WIDTH when the safe zone is narrower. */
  width: number;
}

/** Matches the popover's `w-64`. */
export const POPOVER_WIDTH = 256;
/** Gap between the button's bottom edge and the popover. */
export const POPOVER_GAP = 8;
/** Popover never touches the viewport edge. */
export const VIEWPORT_MARGIN = 12;

/**
 * Place a popover directly below a button, right-aligned to it, dropping
 * down-and-left. The right edge is clamped so it can never extend past the
 * button, the AI panel's left edge (when the panel is open), or the viewport —
 * whichever is leftmost.
 *
 * @param buttonRect   the anchor button's viewport rect
 * @param panelLeft    left edge of the AI panel, or null when it is closed
 * @param viewportWidth `window.innerWidth`
 */
export const computePopoverPlacement = (
  buttonRect: Rect,
  panelLeft: number | null,
  viewportWidth: number
): PopoverPlacement => {
  // A side-by-side AI panel never covers less than ~half the width (its min
  // size is 26%). A `panelLeft` well below that means the panel is a
  // full-width overlay (small screens), where it is meant to sit under the
  // popover — the viewport edge is the only real limit then.
  const isSidePanel = panelLeft !== null && panelLeft >= viewportWidth * 0.3;

  const rightBoundary = Math.min(
    buttonRect.right,
    (isSidePanel ? panelLeft : viewportWidth) - POPOVER_GAP,
    viewportWidth - VIEWPORT_MARGIN
  );

  const left = Math.max(VIEWPORT_MARGIN, rightBoundary - POPOVER_WIDTH);
  const width = Math.max(0, rightBoundary - left);

  return {
    top: buttonRect.bottom + POPOVER_GAP,
    left,
    width,
  };
};

/** The popover's right edge, handy for assertions: left + width. */
export const popoverRightEdge = (placement: PopoverPlacement): number => placement.left + placement.width;
