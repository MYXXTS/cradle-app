import { z } from 'zod'

import { getWorkspacesByWorkspaceIdFilesChildren } from '~/api-gen/sdk.gen'

export const WorkspaceFileListSchema = z.array(z.object({
  type: z.enum(['file', 'directory']),
  name: z.string(),
  path: z.string(),
})).default([])

export type WorkspaceFileEntry = z.infer<typeof WorkspaceFileListSchema>[number]

export async function listWorkspaceFileChildren(
  workspaceId: string,
  path: string,
): Promise<WorkspaceFileEntry[]> {
  const { data } = await getWorkspacesByWorkspaceIdFilesChildren({
    path: { workspaceId },
    query: path.length > 0 ? { path } : undefined,
    throwOnError: true,
  })
  return WorkspaceFileListSchema.parse(data)
}
