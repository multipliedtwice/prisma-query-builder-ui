import type { SavedQueryTemplate, TemplateContext, TrustedRoute, UsageBinding } from '../templates/types.js';
export interface SavedQueryWorkspaceProps {
  context: TemplateContext;
  model: string;
  queries: SavedQueryTemplate[];
  savedQueries: SavedQueryTemplate[];
  bindings: UsageBinding[];
  trustedRoutes: TrustedRoute[];
  createId: () => string;
  onchange: (queries: SavedQueryTemplate[]) => void;
  onSave?: ((query: SavedQueryTemplate) => Promise<SavedQueryTemplate>) | undefined;
  onDelete?: ((query: SavedQueryTemplate) => Promise<void>) | undefined;
  onLink?: ((query: SavedQueryTemplate, routes: string[]) => Promise<UsageBinding[]>) | undefined;
  readOnly?: boolean;
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
}
