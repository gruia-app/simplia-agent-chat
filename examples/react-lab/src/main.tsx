import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@simplia/agent-chat-react/styles.css";
import "./chat-lab.css";
import "./page.css";
import { ChatLab } from "./ChatLab";

const root = document.getElementById("root");
if (!root) throw new Error("react_lab_root_missing");

createRoot(root).render(
  <StrictMode>
    <ChatLab />
  </StrictMode>,
);
