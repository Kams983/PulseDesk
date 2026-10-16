import { useEffect } from 'react';
import { APP_NAME } from '@/utils/constants';

const SUFFIX = APP_NAME;

// One place that owns the browser tab title, so a screen cannot ship a stale one. The suffix is the
// clinic's name rather than the page's, which is what makes two open tabs tellable apart.
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
  }, [title]);
}
