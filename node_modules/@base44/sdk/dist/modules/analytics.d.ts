import { AxiosInstance } from "axios";
import { TrackEventParams, AnalyticsModuleOptions } from "./analytics.types";
import type { AuthModule } from "./auth.types";
export declare const USER_HEARTBEAT_EVENT_NAME = "__user_heartbeat_event__";
export declare const ANALYTICS_INITIALIZATION_EVENT_NAME = "__initialization_event__";
export declare const ANALYTICS_SESSION_DURATION_EVENT_NAME = "__session_duration_event__";
export declare const ANALYTICS_CONFIG_ENABLE_URL_PARAM_KEY = "analytics-enable";
export declare const ANALYTICS_SESSION_ID_LOCAL_STORAGE_KEY = "base44_analytics_session_id";
export declare const ANALYTICS_DENIED_LOCAL_STORAGE_KEY = "base44_analytics_denied";
/** Whether a page in this mode may track before any consent signal. */
export declare function initialConsentGranted(mode: string | null): boolean;
export declare const ANALYTICS_MODE_META_NAME = "base44-analytics";
/** Whether analytics may run and store the session id on this page. */
export declare function isAnalyticsAllowed(): boolean;
export interface AnalyticsModuleArgs {
    axiosClient: AxiosInstance;
    serverUrl: string;
    appId: string;
    userAuthModule: AuthModule;
    enabled: boolean;
}
export declare const createAnalyticsModule: ({ axiosClient, serverUrl, appId, userAuthModule, enabled, }: AnalyticsModuleArgs) => {
    track: (params: TrackEventParams) => void;
    cleanup: () => void;
};
/**
 * Clears the memoized analytics session context.
 *
 * The context holds the `user_id` resolved by `auth.me()` and is reused for the
 * lifetime of the session, so it has to be dropped whenever the identity
 * changes. Without this, a visitor who loads a page anonymously and then logs in
 * keeps reporting `user_id: null` on every subsequent event.
 *
 * @internal
 */
export declare function resetAnalyticsSessionContext(): void;
export declare function getAnalyticsConfigFromUrlParams(): AnalyticsModuleOptions | undefined;
export declare function getAnalyticsSessionId(): string;
