export const UNTITLED_POST_TITLE_PLACEHOLDER = '\u200B';

export function getVisiblePostTitle(title: string | null | undefined): string {
  return (title || '').replace(/\u200B/g, '').trim();
}

export function normalizePostTitleForStorage(title: string): string {
  const visibleTitle = getVisiblePostTitle(title);
  return visibleTitle || UNTITLED_POST_TITLE_PLACEHOLDER;
}
