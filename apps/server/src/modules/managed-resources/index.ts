import { Elysia, t } from 'elysia'

import { AppError } from '../../errors/app-error'
import { ManagedResourceModel } from './model'
import type { ManagedResourceService } from './service'

function rejectCommandBody(body: unknown): void {
  if (body !== undefined) {
    throw new AppError({
      code: 'managed_resource_command_body_forbidden',
      status: 400,
      message: 'Managed resource commands do not accept a request body.',
    })
  }
}

export function createManagedResourcesModule(service: ManagedResourceService) {
  return new Elysia({ prefix: '/managed-resources', detail: { tags: ['managed-resources'] } })
    .get('', () => service.list(), {
      detail: {
        'summary': 'List declared managed resources',
        'x-cradle-cli': { command: ['managed-resources', 'list'] },
      },
      response: { 200: t.Array(ManagedResourceModel.descriptor) },
    })
    .get('/:namespace/:resourceType/:resourceId', ({ params }) => service.get(params), {
      detail: {
        'summary': 'Get a declared managed resource',
        'x-cradle-cli': { command: ['managed-resources', 'get'] },
      },
      params: ManagedResourceModel.keyParams,
      response: { 200: ManagedResourceModel.descriptor },
    })
    .post('/:namespace/:resourceType/:resourceId/install', ({ body, params }) => {
      rejectCommandBody(body)
      return service.execute(params, 'install')
    }, {
      detail: {
        'summary': 'Install a declared managed resource',
        'x-cradle-cli': { command: ['managed-resources', 'install'] },
      },
      params: ManagedResourceModel.keyParams,
      response: { 200: ManagedResourceModel.descriptor },
    })
    .post('/:namespace/:resourceType/:resourceId/update', ({ body, params }) => {
      rejectCommandBody(body)
      return service.execute(params, 'update')
    }, {
      detail: {
        'summary': 'Update a declared managed resource',
        'x-cradle-cli': { command: ['managed-resources', 'update'] },
      },
      params: ManagedResourceModel.keyParams,
      response: { 200: ManagedResourceModel.descriptor },
    })
    .delete('/:namespace/:resourceType/:resourceId', ({ body, params }) => {
      rejectCommandBody(body)
      return service.execute(params, 'uninstall')
    }, {
      detail: {
        'summary': 'Uninstall a declared managed resource',
        'x-cradle-cli': { command: ['managed-resources', 'uninstall'] },
      },
      params: ManagedResourceModel.keyParams,
      response: { 200: ManagedResourceModel.descriptor },
    })
}
