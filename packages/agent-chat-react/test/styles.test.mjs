import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function variable(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `missing --${name}`);
  return match[1];
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

test("default secondary text and placeholders meet WCAG AA contrast", () => {
  assert.ok(contrast(variable("sac-muted"), variable("sac-bg")) >= 4.5);
  assert.ok(contrast(variable("sac-muted"), variable("sac-panel")) >= 4.5);
  assert.match(css, /\.sac-composer-input::placeholder\s*\{\s*color:\s*var\(--sac-muted\)/);
});

test("literal colors are confined to overridable custom properties", () => {
  for (const line of css.split(/\r?\n/)) {
    if (/#[0-9a-fA-F]{3,8}/.test(line)) assert.match(line, /^\s*--sac-[a-z-]+:/);
  }
});

test("motion and coarse-pointer fallbacks remain present", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(css, /min-height:\s*2\.75rem/);
});
