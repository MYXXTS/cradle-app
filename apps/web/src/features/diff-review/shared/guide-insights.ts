import type { CradleDiffReview } from './types'

export function reviewSupportsGuide(review: CradleDiffReview): boolean {
  return review.sourceKind === 'local-working-tree'
}

export function reviewSupportsCommitPlan(review: CradleDiffReview): boolean {
  return review.sourceKind === 'local-working-tree'
}

export function isGuideReady(review: CradleDiffReview): boolean {
  return review.guide.status === 'ready' && review.guide.steps.length > 0
}

export function isGuideGenerationActive(
  status: CradleDiffReview['guide']['status'],
): boolean {
  return status === 'pending' || status === 'running'
}
