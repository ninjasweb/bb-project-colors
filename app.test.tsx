// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadPluginApp,
  mountPluginContentScripts,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";

describe("Project Colors", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() { return values.size; },
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      } satisfies Storage,
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    window.localStorage.clear();
  });

  it("adds exactly seven choices, persists a color, and resets it", async () => {
    document.body.innerHTML = `
      <aside data-sidebar="sidebar">
        <div data-sidebar-project-id="project-one">
          <div data-sidebar-sticky-group>
            <div data-sidebar="group-label">
              <span id="project-title-row"><span title="Project one">Project one</span></span>
              <span data-sidebar-trailing-controls><span></span></span>
            </div>
          </div>
        </div>
      </aside>
    `;

    const app = await loadPluginApp(() => import("./app"));
    const scripts = await mountPluginContentScripts(app, {
      pluginId: "project-colors",
      generation: 1,
    });
    const row = document.querySelector<HTMLElement>("[data-sidebar-project-id]")!;
    const picker = document.querySelector<HTMLButtonElement>(".project-colors-control")!;
    const title = document.querySelector<HTMLElement>('[title="Project one"]')!;

    expect(picker).not.toBeNull();
    expect(picker.parentElement?.id).toBe("project-title-row");
    expect(picker.nextElementSibling).toBe(title);
    picker.click();
    const choices = [...document.querySelectorAll<HTMLButtonElement>(".project-colors-swatch")];
    expect(choices).toHaveLength(7);

    choices.find((choice) => choice.getAttribute("aria-label") === "Blue")!.click();
    expect(row.classList.contains("project-colors-colored")).toBe(true);
    expect(window.localStorage.getItem("bb.project-colors.v1")).toBe(
      JSON.stringify({ "project-one": "blue" }),
    );

    picker.click();
    document
      .querySelector<HTMLButtonElement>('.project-colors-swatch[aria-label="Blue"]')!
      .click();
    expect(row.classList.contains("project-colors-colored")).toBe(false);
    expect(window.localStorage.getItem("bb.project-colors.v1")).toBe("{}");

    await scripts.lifecycle.dispose();
    expect(document.querySelector(".project-colors-control")).toBeNull();
  });

  it("uses square project and thread rows with a translucent header tint", () => {
    const css = readFileSync(resolve(process.cwd(), "app.css"), "utf8");
    expect(css).toContain("background: color-mix");
    expect(css).toContain("box-shadow: inset 1px 0 0 var(--project-sidebar-color)");
    expect(css).toContain("border-radius: 0 !important");
    expect(css).not.toContain("border-radius: inherit !important");
    expect(css).toContain("[data-sidebar-thread-shortcut-target]");
    expect(css).toContain(
      ".bb-sidebar-hover-actions-row:has(> [data-sidebar-thread-shortcut-target]),\n" +
        "[data-sidebar-thread-shortcut-target]",
    );
    expect(css).toContain(".project-colors-header-colored");
    expect(css).toContain(
      "background: color-mix(in srgb, var(--project-header-color) 14%, transparent)",
    );
    expect(css).toContain(".project-colors-thread-provider-icon");
    expect(css.match(/flex: 0 0 20px/g)).toHaveLength(2);
    expect(css.match(/height: 20px/g)).toHaveLength(2);
    expect(css.match(/width: 20px/g)).toHaveLength(2);
    expect(css).toContain('data-provider-kind="claude"');
    expect(css).toContain("color: #d97757");
    expect(css).toContain('data-provider-kind="codex"');
    expect(css).toContain("color: light-dark(#111111, #ffffff)");
  });

  it("registers the thread provider overlay and project color header indicator", async () => {
    const app = await loadPluginApp(() => import("./app"));
    expect(app.appOverlays).toHaveLength(1);
    expect(app.appOverlays[0]?.id).toBe("thread-provider-icons");
    expect(app.threadHeaderActions).toHaveLength(1);
    expect(app.threadHeaderActions[0]?.id).toBe("project-color");
  });

  it("recognizes Codex and Claude providers without matching unrelated providers", async () => {
    const { classifyProvider } = await import("./app");
    expect(classifyProvider({ id: "codex", displayName: "Codex" })).toBe("codex");
    expect(classifyProvider({ id: "claude-code", displayName: "Claude Code" })).toBe(
      "claude",
    );
    expect(classifyProvider({ id: "cursor", displayName: "Cursor" })).toBeNull();
  });

  it("shows small provider icons before Codex and Claude thread titles only", async () => {
    document.body.innerHTML = `
      <aside>
        <div data-sidebar-project-id="project-one">
          <div class="thread-row">
            <a data-sidebar-thread-shortcut-target data-sidebar-thread-id="thread-codex"></a>
            <span class="bb-sidebar-thread-title" id="title-codex">Codex thread</span>
          </div>
          <div class="thread-row">
            <a data-sidebar-thread-shortcut-target data-sidebar-thread-id="thread-claude"></a>
            <span class="bb-sidebar-thread-title" id="title-claude">Claude thread</span>
          </div>
          <div class="thread-row">
            <a data-sidebar-thread-shortcut-target data-sidebar-thread-id="thread-other"></a>
            <span class="bb-sidebar-thread-title" id="title-other">Other thread</span>
          </div>
        </div>
      </aside>
    `;

    const app = await loadPluginApp(() => import("./app"));
    const overlay = renderSlot(app.appOverlays[0]!, {}, {
      sidebarThreads: {
        status: "ready",
        projects: [],
        threads: [
          { id: "thread-codex", providerId: "codex" } as never,
          { id: "thread-claude", providerId: "claude-code" } as never,
          { id: "thread-other", providerId: "cursor" } as never,
        ],
      },
      providers: {
        status: "ready",
        providers: [
          { id: "codex", displayName: "Codex", logoUrl: null } as never,
          { id: "claude-code", displayName: "Claude Code", logoUrl: null } as never,
          { id: "cursor", displayName: "Cursor", logoUrl: null } as never,
        ],
      },
    });

    const codexTitle = document.querySelector("#title-codex")!;
    const codexIcon = codexTitle.previousElementSibling;
    expect(codexIcon?.classList.contains("project-colors-thread-provider-icon")).toBe(true);
    expect(codexIcon?.getAttribute("data-provider-kind")).toBe("codex");
    expect(codexIcon?.querySelector("svg")).not.toBeNull();

    const claudeTitle = document.querySelector("#title-claude")!;
    expect(claudeTitle.previousElementSibling?.getAttribute("data-provider-kind")).toBe(
      "claude",
    );
    expect(
      document.querySelector("#title-other")?.previousElementSibling?.classList.contains(
        "project-colors-thread-provider-icon",
      ),
    ).toBe(false);

    overlay.lifecycle.unmount();
    expect(document.querySelector(".project-colors-thread-provider-icon")).toBeNull();
  });

  it("finds the title area and complete header surface next to the actions", async () => {
    const { findThreadHeaderColorSurface, findThreadHeaderColorTarget } = await import(
      "./app"
    );
    document.body.innerHTML = `
      <header id="thread-header-surface">
        <div data-testid="app-page-header-content-row">
          <div><div id="thread-title-area"><span>Thread title</span></div></div>
          <div data-app-page-header-actions><span id="plugin-marker"></span></div>
        </div>
      </header>
    `;

    const marker = document.querySelector("#plugin-marker")!;
    expect(findThreadHeaderColorTarget(marker)?.id).toBe("thread-title-area");
    expect(findThreadHeaderColorSurface(marker)?.id).toBe("thread-header-surface");
  });

  it("shows the assigned project color before the thread title", async () => {
    const { ThreadHeaderProjectColor } = await import("./app");
    window.localStorage.setItem(
      "bb.project-colors.v1",
      JSON.stringify({ "project-pixels": "yellow" }),
    );
    document.body.innerHTML = `
      <header id="thread-header-surface">
        <div data-testid="app-page-header-content-row">
          <div><div id="thread-title-area"><span>Thread title</span></div></div>
          <div data-app-page-header-actions>
            <span role="group"><span id="plugin-root"></span></span>
          </div>
        </div>
      </header>
    `;

    const root = createRoot(document.querySelector("#plugin-root")!);
    await act(async () => {
      root.render(<ThreadHeaderProjectColor projectId="project-pixels" />);
    });

    const dot = document.querySelector<HTMLElement>("#thread-title-area .project-colors-header-dot");
    expect(dot?.getAttribute("aria-label")).toBe("Project color: Yellow");
    expect(dot?.style.getPropertyValue("--project-header-color")).toBe("#eab308");

    const surface = document.querySelector<HTMLElement>("#thread-header-surface")!;
    expect(surface.classList.contains("project-colors-header-colored")).toBe(true);
    expect(surface.style.getPropertyValue("--project-header-color")).toBe("#eab308");

    await act(async () => root.unmount());
    expect(surface.classList.contains("project-colors-header-colored")).toBe(false);
    expect(surface.style.getPropertyValue("--project-header-color")).toBe("");
  });
});
