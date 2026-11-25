import { useEffect, useRef } from 'react';

/** Opens the dialog on mount and closes it on unmount, like the other dialogs. */
export function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return ref;
}
