import { useState, useEffect, useRef, startTransition } from "react";

function FieldLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <label className={`field-label ${className}`.trim()}>{children}</label>;
}

function NumberInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  deferValidation = false,
  className = "",
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  deferValidation?: boolean;
  className?: string;
}) {
  const [draftValue, setDraftValue] = useState(String(value));
  const currentValueRef = useRef(value);
  const repeatTimerRef = useRef<number | undefined>(undefined);
  const intervalRef = useRef<number | undefined>(undefined);
  const changeByRef = useRef(changeBy);
  changeByRef.current = changeBy;

  useEffect(() => {
    setDraftValue(String(value));
    currentValueRef.current = value;
  }, [value]);

  function changeBy(delta: number) {
    const nextValue = Math.min(max, Math.max(min, currentValueRef.current + delta));
    if (nextValue === currentValueRef.current) return;
    currentValueRef.current = nextValue;
    setDraftValue(String(nextValue));
    // Paint the number immediately; the owning battle page can render afterwards.
    startTransition(() => onChange(nextValue));
  }

  function stopRepeating() {
    window.clearTimeout(repeatTimerRef.current);
    window.clearInterval(intervalRef.current);
    repeatTimerRef.current = undefined;
    intervalRef.current = undefined;
  }

  useEffect(() => {
    window.addEventListener("blur", stopRepeating);
    return () => {
      stopRepeating();
      window.removeEventListener("blur", stopRepeating);
    };
  }, []);

  function startRepeating(event: React.PointerEvent<HTMLButtonElement>, delta: number) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    stopRepeating();
    changeBy(delta);
    event.currentTarget.setPointerCapture(event.pointerId);
    repeatTimerRef.current = window.setTimeout(() => {
      changeByRef.current(delta);
      intervalRef.current = window.setInterval(() => changeByRef.current(delta), 80);
    }, 350);
  }

  function commitDraft() {
    const nextValue = Number(draftValue);
    if (!draftValue.trim() || !Number.isFinite(nextValue)) {
      setDraftValue(String(value));
      currentValueRef.current = value;
      return;
    }
    if (deferValidation) onChange(nextValue);
    else {
      // The owning field may normalize the number (for example min/max).
      // Finish editing with its committed value, without publishing a new one.
      setDraftValue(String(value));
      currentValueRef.current = value;
    }
  }

  return (
    <div className={`number-input-control ${className}`.trim()}>
      <input
        className="num-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={draftValue}
        onBlur={commitDraft}
        onChange={(event) => {
          const text = event.target.value;
          setDraftValue(text);
          if (deferValidation || !text.trim()) return;
          const nextValue = Number(text);
          if (!Number.isFinite(nextValue)) return;
          currentValueRef.current = nextValue;
          onChange(nextValue);
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.select();
          }
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className="number-stepper">
        <button type="button" aria-label="增加数值" title="增加"
          onPointerDown={(event) => startRepeating(event, step)}
          onPointerUp={stopRepeating} onPointerCancel={stopRepeating} onLostPointerCapture={stopRepeating}
          onClick={(event) => { if (event.detail === 0) changeBy(step); }}>▲</button>
        <button type="button" aria-label="减少数值" title="减少"
          onPointerDown={(event) => startRepeating(event, -step)}
          onPointerUp={stopRepeating} onPointerCancel={stopRepeating} onLostPointerCapture={stopRepeating}
          onClick={(event) => { if (event.detail === 0) changeBy(-step); }}>▼</button>
      </span>
    </div>
  );
}

export { NumberInput, FieldLabel };
