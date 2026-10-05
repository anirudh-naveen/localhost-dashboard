import { createRoot } from "react-dom/client";
import "../ui/base.css";
import { App } from "./App";
import "./dashboard.css";

createRoot(document.getElementById("root")!).render(<App />);
