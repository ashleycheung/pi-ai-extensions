/**
 * Shared in-memory cache of user decisions for `request_block_exemption`.
 *
 * Follows the mode-state convention: a shared mutable object whose properties
 * are mutated (never reassigned) so all modules see changes under CommonJS
 * transpilation. Session-scoped — decisions are lost on pi restart.
 */
export interface ExemptionDecision {
  approved: boolean;
  reason?: string;
  ts: number;
}

export const exemptionStore = {
  decisions: new Map<string, ExemptionDecision>(),
};
