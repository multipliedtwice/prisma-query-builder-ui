import { schema } from './context.mjs';
import type { SavedQueryTemplate, TemplateContext, TrustedGenerationContext, UsageManifest } from '../../src/templates/types.js';

export const templateContext: TemplateContext = { schema, identity: { id: 'example-prisma-schema', revision: '1' }, maxRelationDepth: 2, maxTake: 100 };
export const exampleQueries: SavedQueryTemplate[] = [
  { version: 1, id: 'public-profile', name: 'Public profile', model: 'User', operation: 'findUnique', usageKey: 'public-profile',
    payload: { where: { id: 1 }, select: { id: true, name: true, status: true } }, enabled: true, accepted: true, schema: templateContext.identity },
  { version: 1, id: 'account', name: 'Account details', model: 'User', operation: 'findUnique', usageKey: 'account',
    payload: { where: { id: 1 }, select: { id: true, email: true, name: true } }, enabled: true, accepted: true, schema: templateContext.identity },
  { version: 1, id: 'company-dashboard', name: 'Company dashboard', model: 'User', operation: 'findMany', usageKey: 'company-dashboard',
    payload: { select: { id: true, name: true, posts: { select: { id: true, title: true }, take: 3 } }, where: { active: true }, orderBy: { id: 'desc' }, take: 25 }, enabled: true, accepted: true, schema: templateContext.identity },
  { version: 1, id: 'talent-search', name: 'Talent search', model: 'User', operation: 'findMany', usageKey: 'talent-search',
    payload: { select: { id: true, name: true }, where: { name: { contains: 'designer' } }, orderBy: { id: 'asc' }, take: 25, skip: 0 }, enabled: true, accepted: true, schema: templateContext.identity },
  { version: 1, id: 'account-edit', name: 'Edit account', model: 'User', operation: 'update', usageKey: 'account-edit',
    payload: { where: { id: 1 }, data: { name: 'Example name' }, select: { id: true, name: true } }, enabled: true, accepted: true, schema: templateContext.identity },
];
export const trustedExample: TrustedGenerationContext = {
  routes: [
    { id: 'profile.page', label: 'Public profile page', model: 'User', operation: 'findUnique' },
    { id: 'profile.summary', label: 'Profile summary panel', model: 'User', operation: 'findUnique' },
    { id: 'account.page', label: 'Account page', model: 'User', operation: 'findUnique' },
    { id: 'company.dashboard', label: 'Company dashboard', model: 'User', operation: 'findMany' },
    { id: 'talent.search', label: 'Talent search page', model: 'User', operation: 'findMany' },
    { id: 'account.edit', label: 'Account edit action', model: 'User', operation: 'update' },
  ], hookIds: ['operation.before', 'variant.before', 'variant.after', 'operation.after'], variants: [], operations: [],
};
export const exampleManifest: UsageManifest = { version: 1, schema: templateContext.identity,
  bindings: trustedExample.routes.map(route => {
    const id = route.id.startsWith('profile.') ? 'public-profile' : route.id === 'account.page' ? 'account' : route.id.replaceAll('.', '-');
    const query = exampleQueries.find(query => query.id === id);
    if (!query) throw new Error(`Missing authored example query for ${route.id}`);
    return { routeId: route.id, queryId: query.id, model: query.model, operation: query.operation, usageKey: query.usageKey };
  }),
};
