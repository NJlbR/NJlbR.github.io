import { ANNOTATIONS_CATALOG } from '../data/annotationsCatalog';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

export type AnnotationRow = Database['public']['Tables']['annotations']['Row'];

export const BUILTIN_ANNOTATION_PREFIX = 'builtin:';
const CATALOG_TIMESTAMP = '2026-04-01T00:00:00.000Z';
const SUPABASE_PAGE_SIZE = 1000;

export function getBuiltinAnnotationId(term: string): string {
  return `${BUILTIN_ANNOTATION_PREFIX}${encodeURIComponent(term.trim().toLowerCase())}`;
}

export function isBuiltinAnnotationId(id: string): boolean {
  return id.startsWith(BUILTIN_ANNOTATION_PREFIX);
}

const builtinAnnotationsById = new Map<string, AnnotationRow>(
  ANNOTATIONS_CATALOG.map((item) => {
    const id = getBuiltinAnnotationId(item.term);
    return [
      id,
      {
        id,
        term: item.term,
        content: item.content,
        created_at: CATALOG_TIMESTAMP,
        updated_at: CATALOG_TIMESTAMP,
      },
    ];
  })
);

export function getBuiltinAnnotationById(id: string): AnnotationRow | null {
  return builtinAnnotationsById.get(id) ?? null;
}

export function mergeAnnotationsWithCatalog<T extends { id: string; term: string }>(
  dbAnnotations: T[]
): { id: string; term: string }[] {
  const existingTerms = new Set(
    dbAnnotations.map((item) => item.term.trim().toLowerCase())
  );

  const merged: { id: string; term: string }[] = dbAnnotations.map((item) => ({
    id: item.id,
    term: item.term,
  }));

  for (const item of ANNOTATIONS_CATALOG) {
    const normalized = item.term.trim().toLowerCase();
    if (!existingTerms.has(normalized)) {
      existingTerms.add(normalized);
      merged.push({
        id: getBuiltinAnnotationId(item.term),
        term: item.term,
      });
    }
  }

  return merged;
}

export async function fetchAllSupabaseAnnotations<T = AnnotationRow>(
  columns = '*'
): Promise<{ data: T[]; error: Error | null }> {
  if (!isSupabaseConfigured) {
    return { data: [], error: null };
  }

  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('annotations')
      .select(columns)
      .order('term')
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      return { data: allRows, error: new Error(error.message) };
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows.push(...(data as T[]));

    if (data.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  return { data: allRows, error: null };
}
