export interface Rect { x: number; y: number; w: number; h: number }
export interface SnapGuide { orientation: 'v' | 'h'; positionMm: number }
export interface SnapResult { x: number; y: number; guides: SnapGuide[] }

/** Snap a moving rect's edges/centres to page margins, page centre and sibling edges. */
export function computeSnap(
  moving: Rect,
  siblings: Rect[],
  page: { w: number; h: number; margin: number },
  tolerance = 1.5,
): SnapResult {
  const verticalTargets = [page.margin, page.w / 2, page.w - page.margin]
  const horizontalTargets = [page.margin, page.h / 2, page.h - page.margin]
  for (const sibling of siblings) {
    verticalTargets.push(sibling.x, sibling.x + sibling.w / 2, sibling.x + sibling.w)
    horizontalTargets.push(sibling.y, sibling.y + sibling.h / 2, sibling.y + sibling.h)
  }

  const snapAxis = (position: number, size: number, targets: number[]) => {
    const edges = [
      { offset: 0, value: position },
      { offset: size / 2, value: position + size / 2 },
      { offset: size, value: position + size },
    ]
    for (const target of targets) {
      for (const edge of edges) {
        if (Math.abs(edge.value - target) <= tolerance) {
          return { snapped: target - edge.offset, guide: target }
        }
      }
    }
    return null
  }

  const guides: SnapGuide[] = []
  let { x, y } = moving
  const vertical = snapAxis(moving.x, moving.w, verticalTargets)
  if (vertical) { x = vertical.snapped; guides.push({ orientation: 'v', positionMm: vertical.guide }) }
  const horizontal = snapAxis(moving.y, moving.h, horizontalTargets)
  if (horizontal) { y = horizontal.snapped; guides.push({ orientation: 'h', positionMm: horizontal.guide }) }
  return { x, y, guides }
}
