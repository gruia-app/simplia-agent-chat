import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function variable(name, source = css) {
  const match = source.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `missing --${name}`);
  return match[1];
}

function blockAround(anchor) {
  const index = css.indexOf(anchor);
  assert.ok(index >= 0, `missing ${anchor}`);
  const open = css.lastIndexOf("{", index);
  const close = css.indexOf("}", index);
  assert.ok(open >= 0 && close > open, `unclosed block for ${anchor}`);
  return css.slice(open, close + 1);
}

function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const semanticTokens = [
  "sac-color-canvas",
  "sac-color-surface",
  "sac-color-surface-elevated",
  "sac-color-surface-subtle",
  "sac-color-text",
  "sac-color-text-strong",
  "sac-color-text-muted",
  "sac-color-border",
  "sac-color-border-strong",
  "sac-color-accent",
  "sac-color-accent-emphasis",
  "sac-color-accent-contrast",
  "sac-color-focus",
  "sac-color-success",
  "sac-color-success-fg",
  "sac-color-warning",
  "sac-color-warning-fg",
  "sac-color-danger",
  "sac-color-danger-fg",
  "sac-font-body",
  "sac-font-mono",
  "sac-radius-compact",
  "sac-radius-control",
];

const legacyColorVars = [
  "sac-bg",
  "sac-panel",
  "sac-panel-alt",
  "sac-deep",
  "sac-border",
  "sac-border-strong",
  "sac-text",
  "sac-text-strong",
  "sac-muted",
  "sac-button-hover",
  "sac-interaction-bg",
  "sac-blue",
  "sac-blue-border",
  "sac-blue-strong",
  "sac-blue-soft",
  "sac-blue-text",
  "sac-green",
  "sac-green-text",
  "sac-amber",
  "sac-amber-text",
  "sac-red",
  "sac-red-text",
];

test("semantic tokens and theme wrappers are documented in CSS", () => {
  for (const name of semanticTokens) {
    assert.match(css, new RegExp(`--${name}:`));
  }
  assert.match(css, /\.sac-theme\b/);
  assert.match(css, /\[data-sac-theme="light"\]/);
  assert.match(css, /\.sac-theme:not\(\.sac-shell \.sac-theme\):not\(\.sac-theme \.sac-theme\)/);
  assert.match(css, /\[data-sac-theme="dark"\]/);
  assert.match(css, /--sac-color-canvas:\s*var\(--sac-bg\)/);
  assert.match(css, /background:\s*var\(--sac-color-canvas\)/);
  assert.match(css, /color:\s*var\(--sac-color-text\)/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|conic-gradient|glass|box-shadow:\s*[^;]*[0-9.]+px\s+[0-9.]+px\s+[0-9.]+px/i);
});

test("dark compatibility defaults keep the previous palette", () => {
  const dark = blockAround("--sac-bg: #050505");
  assert.equal(variable("sac-bg", dark), "#050505");
  assert.equal(variable("sac-panel", dark), "#0c0c0c");
  assert.equal(variable("sac-text", dark), "#d4d4d8");
  assert.equal(variable("sac-muted", dark), "#a1a1aa");
  assert.equal(variable("sac-blue", dark), "#3b82f6");
  assert.ok(contrast(variable("sac-muted", dark), variable("sac-bg", dark)) >= 4.5);
  assert.ok(contrast(variable("sac-muted", dark), variable("sac-panel", dark)) >= 4.5);
  assert.ok(contrast(variable("sac-text", dark), variable("sac-bg", dark)) >= 4.5);
  assert.ok(contrast(variable("sac-blue-text", dark), variable("sac-bg", dark)) >= 4.5);
  assert.ok(contrast(variable("sac-text-strong", dark), variable("sac-blue-strong", dark)) >= 4.5);
});

test("warm-light preset meets WCAG AA for text, muted, placeholder, status and controls", () => {
  const light = blockAround("--sac-bg: #f3eee4");
  const canvas = variable("sac-bg", light);
  const surface = variable("sac-panel", light);
  const elevated = variable("sac-panel-alt", light);
  const subtle = variable("sac-deep", light);
  const interaction = variable("sac-interaction-bg", light);
  const muted = variable("sac-muted", light);
  const text = variable("sac-text", light);
  const strong = variable("sac-text-strong", light);
  const accentFg = variable("sac-blue-text", light);
  const successFg = variable("sac-green-text", light);
  const warningFg = variable("sac-amber-text", light);
  const dangerFg = variable("sac-red-text", light);
  const accentContrast = variable("sac-color-accent-contrast", light);
  const accentEmphasis = variable("sac-blue-strong", light);

  for (const background of [canvas, surface, elevated, subtle, interaction]) {
    assert.ok(contrast(muted, background) >= 4.5, `muted on ${background}`);
    assert.ok(contrast(text, background) >= 4.5, `text on ${background}`);
    assert.ok(contrast(strong, background) >= 4.5, `strong on ${background}`);
    assert.ok(contrast(accentFg, background) >= 4.5, `accent on ${background}`);
    assert.ok(contrast(successFg, background) >= 4.5, `success on ${background}`);
    assert.ok(contrast(warningFg, background) >= 4.5, `warning on ${background}`);
    assert.ok(contrast(dangerFg, background) >= 4.5, `danger on ${background}`);
  }
  assert.ok(contrast(accentContrast, accentEmphasis) >= 4.5);
  assert.match(css, /\.sac-composer-input::placeholder\s*\{\s*color:\s*var\(--sac-color-text-muted\)/);
});

test("literal colors are confined to overridable custom properties", () => {
  for (const line of css.split(/\r?\n/)) {
    if (/#[0-9a-fA-F]{3,8}/.test(line)) assert.match(line, /^\s*--sac-[a-z-]+:/);
  }
});

test("component rules consume semantic tokens instead of legacy color inputs", () => {
  for (const line of css.split(/\r?\n/)) {
    if (/^\s*--/.test(line) || line.trim() === "") continue;
    for (const name of legacyColorVars) {
      assert.doesNotMatch(line, new RegExp(`var\\(--${name}\\)`), line);
    }
  }
  for (const line of css.split(/\r?\n/)) {
    if (/!important/.test(line)) assert.match(line, /scroll-behavior/);
  }
});

test("nested standalone roots inherit a shell or wrapper theme unless explicitly themed", () => {
  const defaults = css.slice(0, css.indexOf(":where(.sac-shell, .sac-theme)[data-sac-theme=\"light\"]"));
  assert.match(defaults, /\.sac-theme:not\(\.sac-shell \.sac-theme\):not\(\.sac-theme \.sac-theme\)/);
  assert.match(defaults, /\[data-sac-theme="dark"\]/);
});

test("motion, coarse-pointer and artifact-stage contracts remain present", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(css, /min-height:\s*2\.75rem/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /container-type:\s*inline-size/);
  assert.match(css, /container-name:\s*sac-shell/);
  assert.match(css, /@container sac-shell \(min-width: 48rem\)/);
  assert.match(css, /\.sac-workspace-with-stage/);
  assert.doesNotMatch(css, /@media[^{]+\{[^}]*sac-workspace-with-stage/);
});
