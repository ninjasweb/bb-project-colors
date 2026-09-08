import {
  definePluginApp,
  experimental_useProviders,
  experimental_useSidebarThreads,
} from "@get-bb/plugin-sdk/app";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./app.css";

const STORAGE_KEY = "bb.project-colors.v1";
const PROJECT_SELECTOR = "[data-sidebar-project-id]";
const PROJECT_TITLE_SELECTOR =
  ':scope [data-sidebar="group-label"] > span:first-child > span[title]';
const CONTROL_CLASS = "project-colors-control";
const COLORED_CLASS = "project-colors-colored";
const THREAD_PROVIDER_ICON_CLASS = "project-colors-thread-provider-icon";
const COLOR_CHANGE_EVENT = "project-colors:change";

const COLORS = [
  { id: "red", label: "Red", swatch: "#ef4444", color: "light-dark(#b91c1c, #f87171)" },
  { id: "orange", label: "Orange", swatch: "#f97316", color: "light-dark(#c2410c, #fb923c)" },
  { id: "yellow", label: "Yellow", swatch: "#eab308", color: "light-dark(#a16207, #facc15)" },
  { id: "green", label: "Green", swatch: "#22c55e", color: "light-dark(#15803d, #4ade80)" },
  { id: "blue", label: "Blue", swatch: "#3b82f6", color: "light-dark(#1d4ed8, #60a5fa)" },
  { id: "purple", label: "Purple", swatch: "#8b5cf6", color: "light-dark(#6d28d9, #a78bfa)" },
  { id: "pink", label: "Pink", swatch: "#ec4899", color: "light-dark(#be185d, #f472b6)" },
] as const;

type ColorId = (typeof COLORS)[number]["id"];
type ProjectColors = Record<string, ColorId>;
type SupportedProviderKind = "claude" | "codex";
type ThreadProvider = {
  kind: SupportedProviderKind;
  label: string;
};

const colorById = new Map<ColorId, (typeof COLORS)[number]>(
  COLORS.map((color) => [color.id, color]),
);

export function parseProjectColors(raw: string | null): ProjectColors {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          (entry): entry is [string, ColorId] =>
            entry[0].length > 0 &&
            typeof entry[1] === "string" &&
            colorById.has(entry[1] as ColorId),
        )
        .slice(0, 1_000),
    );
  } catch {
    return {};
  }
}

function readProjectColors(): ProjectColors {
  try {
    return parseProjectColors(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeProjectColors(colors: ProjectColors): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // Keep the current visual state when client storage is unavailable.
  }
  window.dispatchEvent(new Event(COLOR_CHANGE_EVENT));
}

export function findThreadHeaderColorTarget(marker: Element): HTMLElement | null {
  const actions = marker.closest("[data-app-page-header-actions]");
  const center = actions?.previousElementSibling;
  const target = center?.firstElementChild;
  return target instanceof HTMLElement ? target : null;
}

export function classifyProvider(provider: {
  id: string;
  displayName: string;
  family?: string;
}): SupportedProviderKind | null {
  const identity = `${provider.id} ${provider.family ?? ""} ${provider.displayName}`
    .toLocaleLowerCase();
  if (/(^|[^a-z])codex([^a-z]|$)/u.test(identity)) return "codex";
  if (/(^|[^a-z])claude([^a-z]|$)/u.test(identity)) return "claude";
  return null;
}

function appendProviderMark(
  target: HTMLElement,
  kind: SupportedProviderKind,
): void {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");

  if (kind === "claude") {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute(
      "d",
      "M12 3v18M3 12h18M5.64 5.64l12.72 12.72M18.36 5.64 5.64 18.36M8.55 3.7l6.9 16.6M3.7 15.45l16.6-6.9",
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-width", "1.45");
    svg.append(path);
  } else {
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * index) / 3 - Math.PI / 2;
      const circle = document.createElementNS(namespace, "circle");
      circle.setAttribute("cx", String(12 + Math.cos(angle) * 3.35));
      circle.setAttribute("cy", String(12 + Math.sin(angle) * 3.35));
      circle.setAttribute("r", "3.55");
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", "currentColor");
      circle.setAttribute("stroke-width", "1.35");
      svg.append(circle);
    }
  }

  target.append(svg);
}

function createThreadProviderIcon(provider: ThreadProvider): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.className = THREAD_PROVIDER_ICON_CLASS;
  icon.dataset.providerKind = provider.kind;
  icon.setAttribute("aria-label", provider.label);
  icon.setAttribute("role", "img");
  icon.title = provider.label;

  appendProviderMark(icon, provider.kind);
  return icon;
}

export function ThreadProviderIcons() {
  const threadState = experimental_useSidebarThreads();
  const providerState = experimental_useProviders();

  useEffect(() => {
    const supportedProviders = new Map<string, ThreadProvider>();
    if (providerState.status === "ready") {
      for (const provider of providerState.providers) {
        const kind = classifyProvider(provider);
        if (kind !== null) {
          supportedProviders.set(provider.id, {
            kind,
            label: provider.displayName,
          });
        }
      }
    }

    const providersByThread = new Map<string, ThreadProvider>();
    if (threadState.status === "ready") {
      for (const thread of threadState.threads) {
        const provider = supportedProviders.get(thread.providerId);
        if (provider !== undefined) providersByThread.set(thread.id, provider);
      }
    }

    const decorate = (): void => {
      document
        .querySelectorAll<HTMLElement>(
          `${PROJECT_SELECTOR} [data-sidebar-thread-shortcut-target][data-sidebar-thread-id]`,
        )
        .forEach((link) => {
          const threadId = link.dataset.sidebarThreadId;
          const provider = threadId === undefined ? undefined : providersByThread.get(threadId);
          const row = link.parentElement;
          const title = row?.querySelector<HTMLElement>(".bb-sidebar-thread-title");
          const current = row?.querySelector<HTMLElement>(
            `:scope .${THREAD_PROVIDER_ICON_CLASS}`,
          );

          if (provider === undefined || title == null || row === null) {
            current?.remove();
            return;
          }
          if (
            current?.dataset.providerKind === provider.kind &&
            current.getAttribute("aria-label") === provider.label
          ) {
            return;
          }

          current?.remove();
          title.before(createThreadProviderIcon(provider));
        });
    };

    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    decorate();
    return () => {
      observer.disconnect();
      document
        .querySelectorAll(`.${THREAD_PROVIDER_ICON_CLASS}`)
        .forEach((icon) => icon.remove());
    };
  }, [providerState.providers, providerState.status, threadState.status, threadState.threads]);

  return null;
}

export function ThreadHeaderProjectColor({ projectId }: { projectId: string }) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [colorId, setColorId] = useState<ColorId | undefined>(
    () => readProjectColors()[projectId],
  );

  useLayoutEffect(() => {
    const marker = markerRef.current;
    setTarget(marker === null ? null : findThreadHeaderColorTarget(marker));
  }, []);

  useEffect(() => {
    const refresh = (): void => setColorId(readProjectColors()[projectId]);
    refresh();
    window.addEventListener(COLOR_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(COLOR_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [projectId]);

  const preset = colorId === undefined ? undefined : colorById.get(colorId);
  return (
    <>
      <span ref={markerRef} className="project-colors-header-marker" />
      {target !== null && preset !== undefined
        ? createPortal(
            <span
              aria-label={`Project color: ${preset.label}`}
              className="project-colors-header-dot"
              role="img"
              style={{ "--project-header-color": preset.swatch } as CSSProperties}
            />,
            target,
          )
        : null}
    </>
  );
}

function projectIdFor(row: Element): string | null {
  const id = (row as HTMLElement).dataset.sidebarProjectId;
  return id === undefined || id.length === 0 ? null : id;
}

function mountProjectColors(signal: AbortSignal): () => void {
  let colors = readProjectColors();
  let palette: HTMLDivElement | null = null;
  let paletteAnchor: HTMLButtonElement | null = null;
  let paletteProjectId: string | null = null;

  const closePalette = (): void => {
    palette?.remove();
    palette = null;
    paletteAnchor?.setAttribute("aria-expanded", "false");
    paletteAnchor = null;
    paletteProjectId = null;
  };

  const applyColor = (row: HTMLElement): void => {
    const projectId = projectIdFor(row);
    if (projectId === null) return;
    const preset = colorById.get(colors[projectId]);
    if (preset === undefined) {
      row.classList.remove(COLORED_CLASS);
      row.style.removeProperty("--project-sidebar-color");
    } else {
      row.classList.add(COLORED_CLASS);
      row.style.setProperty("--project-sidebar-color", preset.color);
    }

    const button = row.querySelector<HTMLButtonElement>(`:scope .${CONTROL_CLASS}`);
    if (button !== null) {
      button.style.setProperty("--project-swatch", preset?.swatch ?? "currentColor");
      button.setAttribute(
        "aria-label",
        preset === undefined
          ? "Choose project color"
          : `Project color: ${preset.label}. Choose another color`,
      );
    }
  };

  const chooseColor = (projectId: string, colorId: ColorId): void => {
    const next = { ...colors };
    if (next[projectId] === colorId) delete next[projectId];
    else next[projectId] = colorId;
    colors = next;
    writeProjectColors(colors);
    document.querySelectorAll<HTMLElement>(PROJECT_SELECTOR).forEach(applyColor);
    closePalette();
  };

  const openPalette = (button: HTMLButtonElement, projectId: string): void => {
    if (palette !== null && paletteProjectId === projectId) {
      closePalette();
      return;
    }
    closePalette();

    paletteAnchor = button;
    paletteProjectId = projectId;
    button.setAttribute("aria-expanded", "true");

    const menu = document.createElement("div");
    menu.className = "project-colors-palette";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Project color");

    for (const preset of COLORS) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "project-colors-swatch";
      swatch.style.setProperty("--project-swatch", preset.swatch);
      swatch.setAttribute("role", "menuitemradio");
      swatch.setAttribute("aria-label", preset.label);
      swatch.setAttribute("aria-checked", String(colors[projectId] === preset.id));
      swatch.title = colors[projectId] === preset.id
        ? `${preset.label} (click again to reset)`
        : preset.label;
      swatch.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        chooseColor(projectId, preset.id);
      });
      menu.append(swatch);
    }

    document.body.append(menu);
    palette = menu;
    const anchorRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, anchorRect.left),
      window.innerWidth - menuRect.width - 8,
    );
    const top = Math.min(anchorRect.bottom + 6, window.innerHeight - menuRect.height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(8, top)}px`;
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  };

  const decorate = (): void => {
    if (signal.aborted) return;
    document.querySelectorAll<HTMLElement>(PROJECT_SELECTOR).forEach((row) => {
      const projectId = projectIdFor(row);
      if (projectId === null) return;

      if (row.querySelector(`:scope .${CONTROL_CLASS}`) === null) {
        const title = row.querySelector<HTMLElement>(PROJECT_TITLE_SELECTOR);
        if (title !== null) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = CONTROL_CLASS;
          button.setAttribute("aria-haspopup", "menu");
          button.setAttribute("aria-expanded", "false");
          button.title = "Project color";
          const dot = document.createElement("span");
          dot.setAttribute("aria-hidden", "true");
          button.append(dot);
          button.addEventListener("pointerdown", (event) => event.stopPropagation());
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openPalette(button, projectId);
          });
          title.before(button);
        }
      }
      applyColor(row);
    });
  };

  const observer = new MutationObserver(decorate);
  observer.observe(document.body, { childList: true, subtree: true });
  decorate();

  const onDocumentPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (palette?.contains(target) || paletteAnchor?.contains(target)) return;
    closePalette();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && palette !== null) {
      const anchor = paletteAnchor;
      closePalette();
      anchor?.focus();
    }
  };
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    observer.disconnect();
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    closePalette();
    document.querySelectorAll<HTMLElement>(PROJECT_SELECTOR).forEach((row) => {
      row.classList.remove(COLORED_CLASS);
      row.style.removeProperty("--project-sidebar-color");
      row.querySelectorAll(`.${CONTROL_CLASS}`).forEach((control) => control.remove());
    });
  };
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "thread-provider-icons",
    component: ThreadProviderIcons,
  });
  app.slots.experimental_threadHeaderAction({
    id: "project-color",
    title: "Project color",
    component: ThreadHeaderProjectColor,
  });
  app.contentScripts.register({
    id: "project-colors",
    mount: ({ signal }) => mountProjectColors(signal),
  });
});
