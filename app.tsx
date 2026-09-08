import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "./app.css";

const STORAGE_KEY = "bb.project-colors.v1";
const PROJECT_SELECTOR = "[data-sidebar-project-id]";
const CONTROL_CLASS = "project-colors-control";
const COLORED_CLASS = "project-colors-colored";

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
        const controls = row.querySelector<HTMLElement>(
          ':scope [data-sidebar="group-label"] [data-sidebar-trailing-controls] > span',
        );
        if (controls !== null) {
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
          controls.prepend(button);
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
  app.contentScripts.register({
    id: "project-colors",
    mount: ({ signal }) => mountProjectColors(signal),
  });
});
