import { createContext, type ReactNode, useState, useEffect, type CSSProperties, useContext } from "react";
import { useExternalIcons } from "../../services/externalIcons";
import { type ExternalIconCatalog } from "../../services/desktopTypes";

function normalizePetIconName(value: string) {
  return value.trim().replace(/^0*(\d+)\s*/, "$1");
}

function buildIconLookup(icons: Record<string, string>, normalize = (value: string) => value.trim()) {
  const exact = new Map<string, string>();
  const defaultForms = new Map<string, string>();
  const suffix = "（本来的样子）";
  for (const [path, src] of Object.entries(icons)) {
    const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.png$/, "");
    exact.set(normalize(name), src);
    if (name.endsWith(suffix)) defaultForms.set(normalize(name.slice(0, -suffix.length)), src);
  }
  return { exact, defaultForms };
}

function buildPetIconLookup(icons: Record<string, string>) {
  const { exact, defaultForms } = buildIconLookup(icons, normalizePetIconName);
  const names = new Map<string, string | null>();
  const fallbackNames = new Map<string, string | null>();
  const megaForms = new Map<string, string>();
  const withoutSuffix = (value: string) => value.replace(/(?:（[^）]*）|\([^)]*\))+$/, "");
  for (const [identity, src] of exact) {
    const name = identity.replace(/^\d+/, "");
    names.set(name, names.has(name) ? null : src);
    const base = withoutSuffix(identity);
    if (!megaForms.has(base)) megaForms.set(base, src);
    const baseName = base.replace(/^\d+/, "");
    if (!megaForms.has(baseName)) megaForms.set(baseName, src);
  }
  for (const [identity, src] of defaultForms) {
    const name = identity.replace(/^\d+/, "");
    fallbackNames.set(name, fallbackNames.has(name) ? null : src);
  }
  return (value: string, mega = false) => {
    if (mega) return megaForms.get(withoutSuffix(normalizePetIconName(value)));
    return /^\d/.test(value.trim())
      ? exact.get(normalizePetIconName(value)) || defaultForms.get(normalizePetIconName(value))
      : names.has(value.trim()) ? names.get(value.trim()) || undefined : fallbackNames.get(value.trim()) || undefined;
  };
}

const MegaPetIconContext = createContext<ReadonlySet<string>>(new Set());

const externalIconLookupCache = new WeakMap<ExternalIconCatalog, {
  pet: ReturnType<typeof buildPetIconLookup>;
  skill: ReturnType<typeof buildIconLookup>;
}>();

function externalIconLookups(catalog: ExternalIconCatalog) {
  let lookup = externalIconLookupCache.get(catalog);
  if (!lookup) {
    lookup = { pet: buildPetIconLookup(catalog.groups.pet), skill: buildIconLookup(catalog.groups.skill) };
    externalIconLookupCache.set(catalog, lookup);
  }
  return lookup;
}

const croppedPetIcons = new Map<string, Promise<string>>();

const croppedPetIconUrls = new Map<string, string>();

const loadedIconRatios = new Map<string, number>();

function visibleImageBounds(pixels: Uint8ClampedArray, width: number, height: number) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function croppedPetIconSource(src: string): Promise<string> {
  const cached = croppedPetIcons.get(src);
  if (cached) return cached;
  const result = new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) { resolve(src); return; }
        context.drawImage(image, 0, 0);
        const bounds = visibleImageBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (!bounds || (bounds.width === canvas.width && bounds.height === canvas.height)) { resolve(src); return; }
        const cropped = document.createElement("canvas");
        cropped.width = bounds.width;
        cropped.height = bounds.height;
        const croppedContext = cropped.getContext("2d");
        if (!croppedContext) { resolve(src); return; }
        croppedContext.drawImage(image, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
        resolve(cropped.toDataURL("image/png"));
      } catch {
        resolve(src);
      }
    };
    image.onerror = () => resolve(src);
    image.src = src;
  }).then((url) => {
    croppedPetIconUrls.set(src, url);
    return url;
  });
  croppedPetIcons.set(src, result);
  return result;
}

function ImageLabel({ src, children, iconOnly = false, className = "", imageClassName = "entity-icon", title, trimTransparent = false, hideTextWhileLoading = false, imageLoading = "eager" }: {
  src?: string;
  children: ReactNode;
  iconOnly?: boolean;
  className?: string;
  imageClassName?: string;
  title?: string;
  trimTransparent?: boolean;
  hideTextWhileLoading?: boolean;
  imageLoading?: "eager" | "lazy";
}) {
  const initialDisplaySrc = src && trimTransparent ? croppedPetIconUrls.get(src) || src : src;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(() => initialDisplaySrc && loadedIconRatios.has(initialDisplaySrc) ? src || null : null);
  const [loadedAspectRatio, setLoadedAspectRatio] = useState<{ source: string; ratio: number } | null>(() => {
    const ratio = initialDisplaySrc && trimTransparent && iconOnly ? loadedIconRatios.get(initialDisplaySrc) : undefined;
    return initialDisplaySrc && ratio ? { source: initialDisplaySrc, ratio } : null;
  });
  const [cropped, setCropped] = useState<{ source: string; url: string } | null>(() => {
    const url = src && trimTransparent ? croppedPetIconUrls.get(src) : undefined;
    return src && url ? { source: src, url } : null;
  });
  const [cropReadySrc, setCropReadySrc] = useState<string | null>(null);
  useEffect(() => {
    if (!src || !trimTransparent || cropped?.source === src || (imageLoading === "lazy" && cropReadySrc !== src)) return;
    let cancelled = false;
    void croppedPetIconSource(src).then((url) => {
      if (!cancelled) setCropped({ source: src, url });
    });
    return () => { cancelled = true; };
  }, [src, trimTransparent, imageLoading, cropReadySrc, cropped?.source]);
  if (!src || failedSrc === src) return <>{children}</>;
  const displaySrc = trimTransparent && cropped?.source === src ? cropped.url : src;
  return <span className={`image-label ${className}`.trim()} title={title} data-image-loaded={loadedSrc === src || undefined} style={loadedAspectRatio?.source === displaySrc ? { "--pet-image-aspect-ratio": loadedAspectRatio.ratio } as CSSProperties : undefined}>
    <img className={imageClassName} src={displaySrc} alt="" draggable={false} loading={imageLoading} decoding={imageLoading === "lazy" ? "async" : undefined} onLoad={(event) => {
      if (loadedSrc !== src) setLoadedSrc(src);
      if (trimTransparent && imageLoading === "lazy" && cropped?.source !== src && cropReadySrc !== src) setCropReadySrc(src);
      if (event.currentTarget.naturalHeight > 0) {
        const ratio = event.currentTarget.naturalWidth / event.currentTarget.naturalHeight;
        loadedIconRatios.set(displaySrc, ratio);
        if (trimTransparent && iconOnly && (loadedAspectRatio?.source !== displaySrc || loadedAspectRatio.ratio !== ratio)) {
          setLoadedAspectRatio({ source: displaySrc, ratio });
        }
      }
    }} onError={() => setFailedSrc(src)} />
    {iconOnly && (loadedSrc === src || hideTextWhileLoading) ? <span className="image-label-hidden-text">{children}</span> : <span className="image-label-text">{children}</span>}
  </span>;
}

function EntityLabel({ kind, value, children = value, iconOnly = false, className = "", imageLoading = "eager", title }: {
  kind: "pet" | "skill";
  value: string;
  children?: ReactNode;
  iconOnly?: boolean;
  className?: string;
  imageLoading?: "eager" | "lazy";
  title?: string;
}) {
  const megaPets = useContext(MegaPetIconContext);
  const icons = externalIconLookups(useExternalIcons());
  const src = kind === "pet" ? icons.pet(value, megaPets.has(normalizePetIconName(value))) : icons.skill.exact.get(value.trim()) || icons.skill.defaultForms.get(value.trim());
  return <ImageLabel key={src || value} src={src} iconOnly={iconOnly} className={className} imageClassName={kind === "pet" ? "entity-icon pet-icon" : "entity-icon"} trimTransparent={kind === "pet"} imageLoading={imageLoading} title={title ?? (typeof children === "string" ? children : value)}>{children}</ImageLabel>;
}

function PickerIcon({ value, kind = "element", imageLoading = "eager" }: { value: string; kind?: "element" | "skill-type"; imageLoading?: "eager" | "lazy" }) {
  const { groups } = useExternalIcons();
  const src = kind === "element"
    ? groups.element[value.replace(/系$/, "")]
    : groups.skill_type[value === "变化" ? "状态" : value];
  return <ImageLabel key={src || value} src={src} iconOnly hideTextWhileLoading imageLoading={imageLoading} imageClassName={`picker-type-icon${kind === "skill-type" ? " skill-type-icon" : ""}`} title={value}>{value}</ImageLabel>;
}

export { EntityLabel, PickerIcon, normalizePetIconName, MegaPetIconContext };
