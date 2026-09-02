'use client';

/**
 * Overlay primitives — Dialog, Sheet, Menu, Tooltip, Toast.
 *
 * They share one piece of machinery (`useDismissable` + `FocusScope`) because
 * they share one set of obligations: escape closes, focus goes in and comes
 * back out to where it started, the page underneath does not scroll, and a
 * pointer outside the surface dismisses it. Getting that wrong once is a bug;
 * getting it wrong five times is a reputation.
 */

import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  // Deliberately not an `offsetParent` check: that reads as null for everything
  // in an environment without layout, which would silently switch the trap off.
  // Inside an open overlay, anything not explicitly hidden is on the screen.
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Traps Tab inside `ref` while `active`, moves focus in on open, and returns it
 * to whatever held it before. Without the restore, closing a dialog drops focus
 * on <body> and a keyboard user starts the page over.
 */
export function useFocusScope(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = focusableWithin(ref.current)[0] ?? ref.current;
    first?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const items = focusableWithin(ref.current);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) return;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previous?.focus?.();
    };
  }, [active, ref]);
}

/** Escape anywhere, or a pointer outside `ref`, closes. */
export function useDismissable(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
  { onOutsidePointer = true }: { onOutsidePointer?: boolean } = {},
) {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss();
      }
    }
    function onPointerDown(event: MouseEvent) {
      if (!onOutsidePointer) return;
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [active, onDismiss, onOutsidePointer, ref]);
}

/** Freezes the page behind a modal so the scrim doesn't scroll with a wheel. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/**
 * True from the first effect pass onward. Overlays portal into <body>, which
 * only exists on the client, and the panel therefore does not exist during the
 * render that opened it — so the focus scope has to wait for this rather than
 * reaching for a ref that is still null.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

type ModalShellProps = PropsWithChildren<{
  description?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: ReactNode;
}>;

function ModalShell({
  children,
  className,
  description,
  footer,
  grip = false,
  onClose,
  open,
  positioner,
  title,
}: ModalShellProps & { className: string; grip?: boolean; positioner: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const mounted = useMounted();
  // Gate on `mounted` too: the panel is inside a portal that does not exist
  // until after the first effect pass.
  const live = open && mounted;
  useFocusScope(panelRef, live);
  useDismissable(panelRef, live, onClose);
  useScrollLock(live);
  if (!live) return null;
  return createPortal(
    <>
      <div aria-hidden="true" className="scrim" />
      <div className={`overlay-positioner ${positioner}`}>
        <div
          aria-describedby={description ? descriptionId : undefined}
          aria-labelledby={titleId}
          aria-modal="true"
          className={className}
          ref={panelRef}
          role="dialog"
          tabIndex={-1}
        >
          {grip ? <span aria-hidden="true" className="sheet-grip" /> : null}
          <div className="overlay-header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description ? <p id={descriptionId}>{description}</p> : null}
            </div>
            <button aria-label="Close" className="overlay-close" onClick={onClose} type="button">
              <X size={17} />
            </button>
          </div>
          <div className="overlay-body">{children}</div>
          {footer ? <div className="overlay-footer">{footer}</div> : null}
        </div>
      </div>
    </>,
    document.body,
  );
}

/** A centred modal. Use it for a decision; use a Sheet for a workspace. */
export function Dialog({ size = 'md', ...props }: ModalShellProps & { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <ModalShell
      {...props}
      className={`dialog-panel${size === 'md' ? '' : ` dialog-panel-${size}`}`}
      positioner="overlay-center"
    />
  );
}

/** An edge-anchored panel. `bottom` is the phone form, `right` the desktop one. */
export function Sheet({
  side = 'right',
  ...props
}: ModalShellProps & { side?: 'right' | 'bottom' }) {
  return (
    <ModalShell
      {...props}
      className={`sheet-panel sheet-${side}`}
      grip={side === 'bottom'}
      positioner={`overlay-${side}`}
    />
  );
}

/* ---------- Menu ---------- */

export type MenuAction = {
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onSelect: () => void;
};

/**
 * A button that opens a list of actions. Arrow keys walk the list, Home/End
 * jump the ends, Escape closes and hands focus back to the trigger.
 */
export function Menu({
  actions,
  align = 'end',
  label,
  trigger,
}: {
  actions: (MenuAction | 'separator')[];
  align?: 'start' | 'end';
  label: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(anchorRef, open, close);

  const items = actions.filter((action): action is MenuAction => action !== 'separator');

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const buttons = focusableWithin(menuRef.current);
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    const step =
      event.key === 'ArrowDown'
        ? (index + 1) % buttons.length
        : event.key === 'ArrowUp'
          ? (index - 1 + buttons.length) % buttons.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : null;
    if (step === null) return;
    event.preventDefault();
    buttons[step]?.focus();
  }

  useEffect(() => {
    if (open) focusableWithin(menuRef.current)[0]?.focus();
  }, [open]);

  return (
    <div className="popover-anchor" ref={anchorRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
        className="quiet-btn"
      >
        {trigger}
      </button>
      {open ? (
        <div
          aria-label={label}
          className={`menu-surface menu-${align}`}
          onKeyDown={onMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          {actions.map((action, index) =>
            action === 'separator' ? (
              <hr className="menu-separator" key={`separator-${index}`} />
            ) : (
              <button
                className={`menu-item${action.danger ? ' menu-item-danger' : ''}`}
                disabled={action.disabled}
                key={action.label}
                onClick={() => {
                  close();
                  action.onSelect();
                }}
                role="menuitem"
                type="button"
              >
                {action.icon}
                {action.label}
              </button>
            ),
          )}
          {items.length === 0 ? <p className="combobox-empty">No actions</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Tooltip ---------- */

/**
 * Supplementary text on hover or focus. Nothing a person needs in order to act
 * belongs in here — a tooltip is invisible to a touch user and to anyone
 * reading the row rather than pointing at it.
 */
export function Tooltip({ children, label }: PropsWithChildren<{ label: string }>) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);
  return (
    <span
      aria-describedby={open ? id : undefined}
      className="tooltip-anchor"
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open ? (
        <span className="tooltip-bubble" id={id} role="tooltip">
          {label}
        </span>
      ) : null}
    </span>
  );
}

/* ---------- Toast ---------- */

export type Toast = {
  detail?: string;
  id: string;
  title: string;
  tone: 'neutral' | 'success' | 'error';
};

type ToastInput = Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone']; duration?: number | null };

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);

/** Wrap the app once. `useToast()` is how anything below reports an outcome. */
export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    ({ duration = 5000, tone = 'neutral', ...rest }: ToastInput) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { ...rest, id, tone }]);
      if (duration !== null) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  const timersRef = timers;
  useEffect(() => {
    const map = timersRef.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, [timersRef]);

  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region">
        {toasts.map((item) => (
          <div
            aria-live={item.tone === 'error' ? 'assertive' : 'polite'}
            className={`toast toast-${item.tone}`}
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
          >
            <span aria-hidden="true" className="toast-dot" />
            <div className="toast-body">
              <div className="toast-title">{item.title}</div>
              {item.detail ? <div className="toast-detail">{item.detail}</div> : null}
            </div>
            <button
              aria-label="Dismiss"
              className="overlay-close"
              onClick={() => dismiss(item.id)}
              type="button"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a <ToastProvider>');
  return context;
}
