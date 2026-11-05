import { Capacitor, registerPlugin } from "@capacitor/core";

const AndroidExternalLink = registerPlugin("AndroidExternalLink");

export async function openExternal(url) {
  if (Capacitor.getPlatform() === "android") {
    await AndroidExternalLink.open({ url });
    return;
  }

  window.open(url, Capacitor.isNativePlatform() ? "_system" : "_blank", "noopener,noreferrer");
}