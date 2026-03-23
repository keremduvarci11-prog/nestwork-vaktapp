import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

document.documentElement.style.cssText = "background:#ffffff !important;margin:0!important;padding:0!important;height:100%!important;";
document.body.style.cssText = "background:#ffffff !important;margin:0!important;padding:0!important;height:100%!important;";

const root = document.getElementById("root")!;
root.style.cssText = "background:#ffffff !important;width:100%;height:100%;min-height:100vh;overflow-y:auto;-webkit-overflow-scrolling:touch;";

createRoot(root).render(<App />);
