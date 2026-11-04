import type { CheckoutElement, CheckoutMount, CompleteCheckoutResult, MountableCheckout, MountCheckoutOptions, PayPalCheckoutOnClick, PayPalEmbeddedCheckout } from "./payments.types.js";
/** @internal */
export type LoadScript = (src: string) => Promise<void>;
/**
 * The response of `GET /payments/config`.
 * @internal
 */
export interface PaymentsCheckoutConfig {
    paypal?: {
        script_url?: string;
        button?: PayPalButtonConfig | null;
    };
    stripe?: {
        script_url?: string;
    };
}
type PayPalButtonConfig = Pick<PayPalEmbeddedCheckout, "client_id" | "merchant_id" | "partner_attribution_id">;
/** @internal */
export interface MountCheckoutDeps {
    completeCheckout: (checkoutId: string) => Promise<CompleteCheckoutResult>;
    getConfig: () => Promise<PaymentsCheckoutConfig>;
    loadScript: LoadScript;
}
/**
 * Appends a script tag once per URL and resolves when it loads.
 * @internal
 */
export declare const loadScript: LoadScript;
/**
 * Fetches the payments config and loads the provider's script ahead of mountCheckout().
 * @internal
 */
export declare function preloadCheckout(provider: "paypal" | "stripe", deps: Pick<MountCheckoutDeps, "getConfig" | "loadScript">): Promise<void>;
/**
 * Mounts the embedded checkout that createCheckout() returned.
 * @internal
 */
export declare function mountCheckout(element: CheckoutElement, checkout: MountableCheckout | PayPalCheckoutOnClick, options: MountCheckoutOptions, deps: MountCheckoutDeps): Promise<CheckoutMount>;
export {};
