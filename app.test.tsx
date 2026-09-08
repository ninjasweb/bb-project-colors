// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadPluginApp,
  mountPluginContentScripts,
} from "@get-bb/plugin-sdk/testing/app";

describe("Project Colors", () => {
  beforeEach(() => {
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
});
