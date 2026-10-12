"use client";

// App-wide feedback: toast notifications (aria-live) and an accessible
// confirmation dialog (native <dialog>, focus-trapped by the browser).

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { buttonClass, cx } from "./ui";

type Toast = { id: number; ok: boolean; message: string };
type ConfirmOptions = { title: string; body?: string; confirmLabel?: string; danger?: boolean };

const Ctx = createContext<{
  toast: (ok: boolean, message: string) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
} | null>(null);

export function useFeedback() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return c;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nextId = useRef(1);

  const toast = useCallback((ok: boolean, message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, ok, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ok ? 4000 : 7000);
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...o, resolve });
      requestAnimationFrame(() => dialogRef.current?.showModal());
    });
  }, []);

  const close = (value: boolean) => {
    pending?.resolve(value);
    dialogRef.current?.close();
    setPending(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}

      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role={t.ok ? "status" : "alert"} className="animate-pop pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius)] border border-line bg-panel px-3.5 py-3 text-[14px] shadow-[var(--shadow-pop)]">
            {t.ok ? <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" /> : <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-bad" />}
            <p className="min-w-0 flex-1 text-ink">{t.message}</p>
            <button type="button" aria-label="Dismiss" className="text-ink-3 hover:text-ink" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          close(false);
        }}
        className="m-auto w-[26rem] max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-line bg-panel p-0 text-ink shadow-[var(--shadow-pop)]"
        aria-labelledby="confirm-title"
      >
        {pending && (
          <div className="p-5">
            <h2 id="confirm-title" className="text-[16px] font-semibold">
              {pending.title}
            </h2>
            {pending.body && <p className="mt-1.5 text-[14px] leading-6 text-ink-2">{pending.body}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={buttonClass("secondary", "sm")} onClick={() => close(false)} autoFocus>
                Cancel
              </button>
              <button type="button" className={cx(buttonClass(pending.danger ? "danger" : "primary", "sm"))} onClick={() => close(true)}>
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </Ctx.Provider>
  );
}
