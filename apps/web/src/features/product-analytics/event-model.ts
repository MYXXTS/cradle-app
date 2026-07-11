import type { SurfaceKind } from '~/navigation/surface-identity'

export type ProductFeatureDomain
  = | 'chat'
    | 'work'
    | 'workspace'
    | 'diff'
    | 'kanban'
    | 'await'
    | 'automation'
    | 'plugins'
    | 'jarvis'

export type ProductAnalyticsOutcome = 'success' | 'failed' | 'cancelled'

export type ProductAnalyticsFailureCategory
  = | 'configuration'
    | 'network'
    | 'permission'
    | 'provider'
    | 'unknown'
    | 'validation'

export type ProductAnalyticsDurationBucket
  = | 'under_10s'
    | '10s_30s'
    | '30s_2m'
    | '2m_10m'
    | 'over_10m'

export type ProductAnalyticsTask
  = | {
    feature_domain: 'chat'
    task_kind: 'agent_run'
    task_variant: null
  }
  | {
    feature_domain: 'work'
    task_kind: 'work_create'
    task_variant: 'issue' | 'new_work'
  }
  | {
    feature_domain: 'work'
    task_kind: 'draft_submit'
    task_variant: 'create_draft' | 'update_draft'
  }
  | {
    feature_domain: 'work'
    task_kind: 'mark_ready'
    task_variant: null
  }
  | {
    feature_domain: 'workspace'
    task_kind: 'workspace_add'
    task_variant: 'local' | 'remote'
  }

export interface ProductAnalyticsEventMap {
  app_opened: {
    lifecycle_stage: 'first_seen' | 'returning' | 'updated'
    previous_version: string | null
  }
  surface_viewed: {
    surface: SurfaceKind
    feature_domain: ProductFeatureDomain | null
  }
  onboarding_completed: Record<string, never>
  task_started: ProductAnalyticsTask
  task_finished: ProductAnalyticsTask & {
    outcome: ProductAnalyticsOutcome
    duration_bucket: ProductAnalyticsDurationBucket
    failure_category: ProductAnalyticsFailureCategory | null
  }
}

export function featureDomainForSurface(surface: SurfaceKind): ProductFeatureDomain | null {
  switch (surface) {
    case 'new-chat':
    case 'chat':
      return 'chat'
    case 'new-work':
    case 'work':
      return 'work'
    case 'workspace':
      return 'workspace'
    case 'diff':
    case 'workspace-diffs':
      return 'diff'
    case 'kanban':
      return 'kanban'
    case 'awaits':
      return 'await'
    case 'automation':
      return 'automation'
    case 'plugin':
    case 'plugin-center':
      return 'plugins'
    default:
      return null
  }
}

export function bucketProductAnalyticsDuration(durationMs: number): ProductAnalyticsDurationBucket {
  if (durationMs < 10_000) {
    return 'under_10s'
  }
  if (durationMs < 30_000) {
    return '10s_30s'
  }
  if (durationMs < 120_000) {
    return '30s_2m'
  }
  if (durationMs < 600_000) {
    return '2m_10m'
  }
  return 'over_10m'
}
