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
              <span><span title="Project one">Project one</span></span>
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

    expect(picker).not.toBeNull();
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

  it("uses square translucent colors for projects and their threads", () => {
    const css = readFileSync(resolve(process.cwd(), "app.css"), "utf8");
    expect(css).toContain("background: color-mix");
    expect(css).toContain("border-radius: 0 !important");
    expect(css).toContain("[data-sidebar-thread-shortcut-target]");
  });

  it("registers a project color indicator for thread headers", async () => {
    const app = await loadPluginApp(() => import("./app"));
    expect(app.threadHeaderActions).toHaveLength(1);
    expect(app.threadHeaderActions[0]?.id).toBe("project-color");
  });

  it("finds the title area next to the current thread actions", async () => {
    const { findThreadHeaderColorTarget } = await import("./app");
    document.body.innerHTML = `
      <header>
        <div data-testid="app-page-header-content-row">
          <div><div id="thread-title-area"><span>Thread title</span></div></div>
          <div data-app-page-header-actions><span id="plugin-marker"></span></div>
        </div>
      </header>
    `;

    const marker = document.querySelector("#plugin-marker")!;
    expect(findThreadHeaderColorTarget(marker)?.id).toBe("thread-title-area");
  });

  it("shows the assigned project color before the thread title", async () => {
    const { ThreadHeaderProjectColor } = await import("./app");
    window.localStorage.setItem(
      "bb.project-colors.v1",
      JSON.stringify({ "project-pixels": "yellow" }),
    );
    document.body.innerHTML = `
      <header>
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

    await act(async () => root.unmount());
  });
});
