import { refuse } from '../core/json.js';
import { inspectTemplate } from './derive.js';
import { assertStableIdentity, queryChanged, readSavedQuery, serializeSavedQuery } from './saved-query.js';
import type { SavedQueryTemplate, TemplateContext } from './types.js';
import type { Payload } from '../query/types.js';

export interface SaveTicket { query: SavedQueryTemplate; revision: string }
export function editTemplate(query: SavedQueryTemplate, payload: Payload): SavedQueryTemplate {
  const next = readSavedQuery({ ...query, payload });
  return queryChanged(next, query) ? { ...next, accepted: false } : query;
}
export function reviewTemplate(query: SavedQueryTemplate, context: TemplateContext): SavedQueryTemplate {
  const reviewed = readSavedQuery({ ...query, schema: context.identity, accepted: false });
  const result = inspectTemplate(reviewed, context);
  if (result.state === 'invalid' || result.state === 'stale') refuse('$query', 'invalid_template', result.issues[0]?.message ?? 'Review the query before accepting it');
  return { ...reviewed, accepted: true };
}
export function beginSave(query: SavedQueryTemplate, context: TemplateContext): SaveTicket {
  const snapshot = readSavedQuery(query);
  if (snapshot.accepted && ['invalid', 'stale'].includes(inspectTemplate(snapshot, context).state)) refuse('$query', 'invalid_accepted', 'An invalid or stale query cannot be saved as accepted');
  return { query: snapshot, revision: serializeSavedQuery(snapshot) };
}
export function acknowledgeSave(ticket: SaveTicket, acknowledgment: unknown): SavedQueryTemplate {
  const saved = readSavedQuery(acknowledgment);
  assertStableIdentity(ticket.query, saved);
  if (serializeSavedQuery(saved) !== ticket.revision) refuse('$save', 'save_mismatch', 'The storage owner did not confirm the exact saved query');
  return saved;
}
