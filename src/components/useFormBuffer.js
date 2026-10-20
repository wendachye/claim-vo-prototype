import { useCallback, useRef, useState } from 'react';
import { readFormBuffer, writeFormBuffer } from '../data/form-buffer.js';

export function useBufferedState(projectId, scope, initial) {
  const identity = JSON.stringify([String(projectId), String(scope)]);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const read = () => {
    const buffered = readFormBuffer(projectId, scope);
    return buffered === undefined ? (typeof initialRef.current === 'function' ? initialRef.current() : initialRef.current) : buffered;
  };
  const [entry, setEntry] = useState(() => ({ identity, value: read() }));
  const value = entry.identity === identity ? entry.value : read();
  const current = useRef({ identity, value });
  current.current = { identity, value };
  if (entry.identity !== identity) setEntry({ identity, value });

  const update = useCallback((next) => {
    const value = typeof next === 'function' ? next(current.current.value) : next;
    current.current = { identity, value };
    writeFormBuffer(projectId, scope, value);
    setEntry({ identity, value });
  }, [identity, projectId, scope]);
  return [value, update];
}
