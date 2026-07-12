import { placeholderClientBanner } from "./placeholder";
import "./styles/tokens.css";

const root = document.getElementById("root");
if (root) {
  root.textContent = placeholderClientBanner();
}
