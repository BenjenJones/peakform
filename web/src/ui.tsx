import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { type Key, useI18n } from "./i18n";

/** Small "?" that explains a metric on hover, keyboard focus or tap. */
export function Info({ help }: { help: Key }) {
  const { t } = useI18n();
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);

  const show = () => {
    // Open toward the side with more room so the popover stays on screen.
    const r = ref.current?.getBoundingClientRect();
    if (r) setAlignRight(r.left > innerWidth / 2);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener("pointerdown", close);
    addEventListener("keydown", close);
    return () => {
      removeEventListener("pointerdown", close);
      removeEventListener("keydown", close);
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
        <span role="tooltip" id={id} className={`info-pop ${alignRight ? "right" : ""}`}>
          {t(help)}
        </span>
      )}
    </span>
  );
}

/** Card heading with optional explanation and subtitle. */
export function CardTitle({ title, sub, help, children }: { title: ReactNode; sub?: ReactNode; help?: Key; children?: ReactNode }) {
  return (
    <>
      <h2>
        {title}
        {help && <Info help={help} />}
        {children}
      </h2>
      {sub && <p className="sub">{sub}</p>}
    </>
  );
}
