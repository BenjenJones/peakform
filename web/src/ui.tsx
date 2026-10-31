import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
