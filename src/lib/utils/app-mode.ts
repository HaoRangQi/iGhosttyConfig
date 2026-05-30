import {env} from "$env/dynamic/public";

export type AppMode = "local" | "remote";

export const appMode: AppMode = env.PUBLIC_GHOSTTY_CONFIG_MODE === "remote" ? "remote" : "local";
export const isRemoteMode = appMode === "remote";
