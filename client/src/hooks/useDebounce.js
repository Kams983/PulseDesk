import { useEffect, useState } from 'react';

// A search box that fires on every keystroke would send a request per letter; this holds the value back
// until the typing pauses. 300ms is short enough to still feel immediate.
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
