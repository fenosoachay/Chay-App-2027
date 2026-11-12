// Version de l'application — source unique : package.json (jamais codée en dur dans l'UI).
import pkg from "../../package.json";

export const APP_VERSION = pkg.version || "0.0.0";
export const APP_NAME = "Église Chay";