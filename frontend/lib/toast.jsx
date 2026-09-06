import { useState, useCallback } from "react";

export function useToast() {
  const [toast, setToast] = useState(null); // { message, kind } | null

  const showToast = useCallback((message, kind = "success") => {
    setToast({ message, kind });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 3200);
  }, []);

  return { toast, showToast };
}

export function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`sg-toast ${toast.kind === "error" ? "error" : ""}`}>{toast.message}</div>;
}