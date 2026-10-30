import { useState } from "react";

const BUTTON_ICONS = import.meta.glob<string>("../../../src-tauri/icons/{refresh,trigger}.png", { eager: true, query: "?url", import: "default" });

function ActionIconButton({ icon, label, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: "refresh" | "trigger"; label: string }) {
  const src = BUTTON_ICONS[`../../../src-tauri/icons/${icon}.png`];
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showIcon = Boolean(src && failedSrc !== src);
  return <button {...props} className={`${showIcon ? `${icon}-button ` : ""}${className}`.trim()} title={label} aria-label={label}>{showIcon ? <img src={src} alt="" draggable={false} onError={() => setFailedSrc(src)} /> : label}</button>;
}

function RefreshButton({ label = "重置", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return <ActionIconButton {...props} icon="refresh" label={label} />;
}

function TriggerButton({ label = "触发", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return <ActionIconButton {...props} icon="trigger" label={label} />;
}

export { RefreshButton, TriggerButton };
