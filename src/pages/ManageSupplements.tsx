import { useState } from 'react';
import { Pencil, Plus, RefreshCw } from 'lucide-react';
import { useSupplements } from '~/hooks/useSupplements';
import { BUILT_IN_SUPPLEMENTS, doseSummary } from '~/lib/supplements';
import type { UserSupplement } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { SupplementEditor, type SupplementFormFields } from '~/components/SupplementEditor';

type EditorState = { mode: 'add' } | { mode: 'edit'; supplement: UserSupplement } | null;

/**
 * Supplement list management: quick-add the unused built-ins (canonical slugs,
 * explicit user choice — nothing is ever seeded automatically), add custom
 * entries, edit dose/instructions, deactivate/reactivate, and guarded hard
 * delete. Deactivation is the primary removal path.
 */
export default function ManageSupplements() {
  const { supplements, loading, error, add, update, remove, reload } = useSupplements();
  const [editor, setEditor] = useState<EditorState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeRows = supplements.filter((s) => s.active);
  const inactiveRows = supplements.filter((s) => !s.active);
  const unusedBuiltIns = BUILT_IN_SUPPLEMENTS.filter(
    (builtIn) => !supplements.some((s) => s.slug === builtIn.slug),
  );

  async function quickAdd(slug: string, name: string) {
    setActionError(null);
    try {
      await add({ slug, name });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : `Failed to add ${name}`);
    }
  }

  async function toggleActive(supplement: UserSupplement) {
    setActionError(null);
    try {
      await update(supplement.id, { active: !supplement.active });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to update supplement');
    }
  }

  async function handleSave(fields: SupplementFormFields) {
    if (editor?.mode === 'edit') {
      await update(editor.supplement.id, fields);
    } else {
      await add({ ...fields });
    }
    setEditor(null);
  }

  async function handleDelete() {
    if (editor?.mode !== 'edit') return;
    await remove(editor.supplement.id);
    setEditor(null);
  }

  function row(supplement: UserSupplement) {
    const summary = doseSummary(supplement);
    return (
      <div key={supplement.id} className="card flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{supplement.name}</p>
          {summary && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{summary}</p>
          )}
        </div>
        <button
          type="button"
          aria-label={`Edit ${supplement.name}`}
          onClick={() => {
            setEditor({ mode: 'edit', supplement });
          }}
          className="shrink-0 rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={supplement.active}
          aria-label={`${supplement.name} active`}
          onClick={() => void toggleActive(supplement)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            supplement.active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              supplement.active ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Supplements" backTo="/settings" />

      {loading ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-16 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="card">
          <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          <button type="button" onClick={() => void reload()} className="btn-primary">
            <RefreshCw className="h-4 w-4" aria-hidden />
            Retry
          </button>
        </div>
      ) : (
        <>
          {supplements.length === 0 && !editor && (
            <div className="card mb-4 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Add your first supplement — pick one below or create your own. Doses and
                instructions are yours to fill in.
              </p>
            </div>
          )}

          {unusedBuiltIns.length > 0 && (
            <section className="mb-4" aria-label="Quick add">
              <h2 className="section-title">Quick add</h2>
              <div className="flex flex-wrap gap-2">
                {unusedBuiltIns.map((builtIn) => (
                  <button
                    key={builtIn.slug}
                    type="button"
                    aria-label={`Add ${builtIn.name}`}
                    onClick={() => void quickAdd(builtIn.slug, builtIn.name)}
                    className="flex items-center gap-1 rounded-full border border-emerald-500/50 px-3 py-1.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {builtIn.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {actionError && (
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
              {actionError}
            </p>
          )}

          {editor ? (
            <SupplementEditor
              supplement={editor.mode === 'edit' ? editor.supplement : null}
              onSave={handleSave}
              onCancel={() => setEditor(null)}
              onDelete={
                editor.mode === 'edit' &&
                !BUILT_IN_SUPPLEMENTS.some((builtIn) => builtIn.slug === editor.supplement.slug)
                  ? handleDelete
                  : undefined
              }
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditor({ mode: 'add' });
              }}
              className="btn-primary mb-4"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add custom supplement
            </button>
          )}

          {activeRows.length > 0 && (
            <section className="mb-4" aria-label="Active supplements">
              <h2 className="section-title">Your supplements</h2>
              <div className="space-y-3">{activeRows.map(row)}</div>
            </section>
          )}

          {inactiveRows.length > 0 && (
            <section className="mb-4" aria-label="Inactive">
              <h2 className="section-title">Inactive</h2>
              <div className="space-y-3 opacity-70">{inactiveRows.map(row)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
