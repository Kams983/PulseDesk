import { useEffect, useState } from 'react';

// The appointment list is a table on a desk and a stack of cards on a phone. Both layouts exist, and
// rendering the one that is off screen would double the rows in the dom for no reader, so the choice is
// made in javascript and the css breakpoint is only there to keep the two in step.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);

    function onChange(event) {
      setMatches(event.matches);
    }

    setMatches(list.matches);
    list.addEventListener('change', onChange);

    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
