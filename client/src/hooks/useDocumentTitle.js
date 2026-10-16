import { useEffect } from 'react';

const SUFFIX = 'EMR Appointments';

// One place that owns the browser tab title, so a screen cannot ship a stale one. The suffix is the
// clinic's name rather than the page's, which is what makes two open tabs tellable apart.
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
  }, [title]);
}
