export interface AnnotationMatch {
  term: string;
  annotationId: string;
  start: number;
  end: number;
}

export function detectAnnotations(
  text: string,
  annotations: { id: string; term: string }[]
): AnnotationMatch[] {
  const matches: AnnotationMatch[] = [];
  const lowerText = text.toLowerCase();

  annotations.forEach((annotation) => {
    const lowerTerm = annotation.term.toLowerCase();
    let startIndex = 0;

    while (true) {
      const index = lowerText.indexOf(lowerTerm, startIndex);
      if (index === -1) break;

      const beforeChar = index > 0 ? text[index - 1] : ' ';
      const afterChar = index + lowerTerm.length < text.length ? text[index + lowerTerm.length] : ' ';

      const isWordBoundaryBefore = /[\s,.!?;:()[\]{}"'«»—-]/.test(beforeChar);
      const isWordBoundaryAfter = /[\s,.!?;:()[\]{}"'«»—-]/.test(afterChar);

      if (isWordBoundaryBefore && isWordBoundaryAfter) {
        const overlaps = matches.some(
          (m) => (index >= m.start && index < m.end) || (index + lowerTerm.length > m.start && index + lowerTerm.length <= m.end)
        );

        if (!overlaps) {
          matches.push({
            term: annotation.term,
            annotationId: annotation.id,
            start: index,
            end: index + lowerTerm.length,
          });
        }
      }

      startIndex = index + 1;
    }
  });

  return matches.sort((a, b) => a.start - b.start);
}
