import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentChatWorkspace } from "../dist/index.js";

const source = readFileSync(new URL("../src/AgentChatWorkspace.tsx", import.meta.url), "utf8");

test("workspace renders one host-owned sentinel instead of mapping 10k library rows", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatWorkspace, {
      ariaLabel: "Virtualized workspace",
      historyLabel: "History",
      history: createElement(
        "div",
        { "data-virtualized-history": "10000" },
        "virtualized-history-sentinel",
      ),
      conversation: createElement(
        "div",
        { "data-virtualized-conversation": "1" },
        "conversation-sentinel",
      ),
      workQueueLabel: "Queue",
      workQueue: createElement(
        "div",
        { "data-virtualized-queue": "10000" },
        "virtualized-queue-sentinel",
      ),
      workbenchLabel: "Workbench",
      workbench: "Workbench pane",
    }),
  );

  assert.equal(html.split("virtualized-history-sentinel").length - 1, 1);
  assert.equal(html.split("virtualized-queue-sentinel").length - 1, 1);
  assert.match(html, /data-virtualized-history="10000"/);
  assert.match(html, /data-virtualized-queue="10000"/);
  assert.doesNotMatch(html, /history-item-9999|queue-row-9999|thread-9999/);
  assert.doesNotMatch(source, /historyItems|queueRows|threads\s*=/);
  assert.doesNotMatch(source, /\.map\(/);
});
