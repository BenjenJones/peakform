import { IconDeviceMobileRotated, IconX } from "@tabler/icons-react";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Key, useI18n } from "./i18n";
import { type MetricKey, MetricIcon } from "./icons";

/** Small "?" that explains a metric on hover, keyboard focus or tap. */
export function Info({ help }: { help: Key }) {
  const { t } = useI18n();
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => setOpen(true);

  // Fixed and clamped to the viewport: on phones there is not enough room on either side of the "?".
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const r = ref.current!.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = popRef.current!;
    const below = r.bottom + 6;
    setPos({
      top: below + h > innerHeight - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : below,
      left: Math.max(16, Math.min(r.left - 8, innerWidth - 16 - w)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // A fixed popover would detach from its "?" on scroll.
    const hide = () => setOpen(false);
    addEventListener("pointerdown", close);
    addEventListener("keydown", close);
    addEventListener("scroll", hide, true);
    addEventListener("resize", hide);
    return () => {
      removeEventListener("pointerdown", close);
      removeEventListener("keydown", close);
      removeEventListener("scroll", hide, true);
      removeEventListener("resize", hide);
    };
  }, [open]);

  return (
    <span ref={ref} className="info" onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="info-btn"
        aria-label={t("help.label")}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={show}
        onBlur={() => setOpen(false)}
        // Open only, never toggle: a tap fires mouseenter/focus (open) right before click.
        // Closing happens via outside tap, Escape, blur or mouseleave.
        onClick={(e) => {
          e.stopPropagation();
          show();
        }}
      >
        ?
      </button>
      {open && (
        <span
          ref={popRef}
          role="tooltip"
          id={id}
          className="info-pop"
          style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
        >
          {t(help)}
        </span>
      )}
    </span>
  );
}

let leaving = false;

/** Leaves an open dialog for another page: takes over the dialog's history entry instead of going back first. */
export function leaveTo(hash: string) {
  leaving = true;
  history.replaceState(null, "", hash);
  dispatchEvent(new HashChangeEvent("hashchange"));
}

// Rotating needs fullscreen first; iPhones have neither, there the phone is simply turned.
const canRotate = () =>
  !!document.fullscreenEnabled && typeof (screen.orientation as { lock?: unknown } | undefined)?.lock === "function" && matchMedia("(pointer: coarse)").matches;

/** Dialog for a big chart, full screen on phones. Closes on Escape, the close button and the phone's back button. */
export function Dialog({ title, icon, tools, onClose, children }: {
  title: ReactNode;
  icon?: MetricKey;
  /** Extra controls in the header, e.g. a range picker. */
  tools?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [full, setFull] = useState(false);

  useEffect(() => {
    // An own history entry, so "back" on a phone closes the dialog instead of leaving the page.
    history.pushState({ dialog: true }, "");
    let popped = false;
    const pop = () => {
      popped = true;
      closeRef.current();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && closeRef.current();
    const fs = () => setFull(!!document.fullscreenElement);
    addEventListener("popstate", pop);
    addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", fs);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("popstate", pop);
      removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", fs);
      document.body.style.overflow = overflow;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (!popped && !leaving) history.back();
      leaving = false;
    };
  }, []);

  const rotate = async () => {
    if (document.fullscreenElement) {
      screen.orientation.unlock?.();
      return document.exitFullscreen().catch(() => {});
    }
    try {
      await ref.current!.requestFullscreen();
      await (screen.orientation as ScreenOrientation & { lock: (o: string) => Promise<void> }).lock("landscape");
    } catch {}
  };

  return createPortal(
    // A click on the dimmed area around the dialog closes it; on phones the dialog covers it all.
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true">
        <div className="dialog-head">
          <h2>
            {icon && <MetricIcon m={icon} />}
            {title}
          </h2>
          <div className="dialog-tools">
            {tools}
            {canRotate() && (
              <button type="button" className="btn icon" onClick={rotate} aria-pressed={full} aria-label={t("zoom.rotate")} title={t("zoom.rotate")}>
                <IconDeviceMobileRotated size={18} stroke={1.75} aria-hidden="true" />
              </button>
            )}
            <button type="button" className="btn icon" onClick={onClose} aria-label={t("zoom.close")} title={t("zoom.close")} autoFocus>
              <IconX size={18} stroke={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Card heading with optional explanation and subtitle. */
export function CardTitle({ title, sub, help, icon, children }: { title: ReactNode; sub?: ReactNode; help?: Key; icon?: MetricKey; children?: ReactNode }) {
  return (
    <>
      <h2>
        {icon && <MetricIcon m={icon} />}
        {title}
        {help && <Info help={help} />}
        {children}
      </h2>
      {sub && <p className="sub">{sub}</p>}
    </>
  );
}
