/**
 * Email, webhooks, and other vendor calls belong behind functions/src/providers.
 * Name the side effect here when a product workflow needs one.
 */
export interface SideEffect {
  name: string;
}

export const sideEffects: readonly SideEffect[] = [];
