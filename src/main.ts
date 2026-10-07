import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import { mountStage } from "./ui/stage";
import { go, wireNavigation } from "./ui/nav";

const stage = document.getElementById("stage") as HTMLElement;
mountStage(stage);
wireNavigation(stage);

// iPad Safari ignores user-scalable=no in some cases; block pinch zoom explicitly.
document.addEventListener("gesturestart", (e) => e.preventDefault());

// Updates download in the background and apply on the next launch.
registerSW({ immediate: true });

(document.getElementById("loading") as HTMLElement).hidden = true;
go("home");
