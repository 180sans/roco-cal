import { useState, useEffect } from "react";

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

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  function changeBy(delta: number) {
    const nextValue = Math.min(max, Math.max(min, value + delta));
    if (deferValidation) {
      setDraftValue(String(nextValue));
      onChange(nextValue);
      return;
    }
    onChange(nextValue);
  }

  function commitDraft() {
    if (!deferValidation) return;
    const nextValue = Number(draftValue);
    if (!draftValue.trim() || !Number.isFinite(nextValue)) {
      setDraftValue(String(value));
      return;
    }
    onChange(nextValue);
  }

  return (
    <div className={`number-input-control ${className}`.trim()}>
      <input
        className="num-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={deferValidation ? draftValue : value}
        onBlur={commitDraft}
        onChange={(event) => {
          if (deferValidation) {
            setDraftValue(event.target.value);
            return;
          }
          onChange(Number(event.target.value));
        }}
        onKeyDown={(event) => {
          if (deferValidation && event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className="number-stepper">
        <button type="button" aria-label="增加数值" title="增加" onClick={() => changeBy(step)}>▲</button>
        <button type="button" aria-label="减少数值" title="减少" onClick={() => changeBy(-step)}>▼</button>
      </span>
    </div>
  );
}

export { NumberInput, FieldLabel };
