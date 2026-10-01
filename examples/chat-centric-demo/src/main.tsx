import React from "react";
import { createRoot } from "react-dom/client";
import "@simplia/agent-chat-react/styles.css";
import "./style.css";
import { App } from "./App";
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
