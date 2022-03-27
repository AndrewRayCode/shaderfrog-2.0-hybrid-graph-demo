import { useEffect, useState } from 'react';

type Setter<T> = (value: T | ((value: T) => T)) => void;

export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T)
): [val: T, setter: Setter<T>, reset: () => T] {
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(() => {
    // Get from local storage by key
    const item = window.localStorage.getItem(key);
    // Parse stored json or if none return initialValue
    return item
      ? JSON.parse(item)
      : initialValue instanceof Function
      ? initialValue()
      : initialValue;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    }
  }, [key, storedValue]);

  const reset = (): T => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
    const initial =
      initialValue instanceof Function ? initialValue() : initialValue;
    setStoredValue(initial);
    return initial;
  };

  return [storedValue, setStoredValue, reset];
}
