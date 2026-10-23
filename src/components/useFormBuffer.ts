import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { readFormBuffer, writeFormBuffer } from '../data/form-buffer.ts';

export function useBufferedState<T>(projectId: string, scope: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const identity = JSON.stringify([String(projectId), String(scope)]);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const read = (): T => {
    const buffered = readFormBuffer(projectId, scope) as T | undefined;
    return buffered === undefined
      ? typeof initialRef.current === 'function' ? (initialRef.current as () => T)() : initialRef.current
      : buffered;
  };
  const [entry, setEntry] = useState(() => ({ identity, value: read() }));
  const value = entry.identity === identity ? entry.value : read();
  const current = useRef({ identity, value });
  current.current = { identity, value };
  if (entry.identity !== identity) setEntry({ identity, value });

  const update = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    const value = typeof next === 'function' ? (next as (previous: T) => T)(current.current.value) : next;
    current.current = { identity, value };
    writeFormBuffer(projectId, scope, value);
    setEntry({ identity, value });
  }, [identity, projectId, scope]);
  return [value, update];
}
