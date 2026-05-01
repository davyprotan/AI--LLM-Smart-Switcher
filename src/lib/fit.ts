export type FitTierId = "fits" | "tight" | "swap" | "wont";

export interface FitTier {
  id: FitTierId;
  label: string;
  /** Short verdict suitable for a small badge ("Fits", "Tight", etc.). */
  short: string;
}

/**
 * Rough heuristic for whether a local model will fit in available VRAM.
 * Real-world fit also depends on context length, KV cache and quantization,
 * so this is a hint, not a guarantee.
 */
export function fitTier(
  vramRequiredGb: number | null | undefined,
  vramAvailableGb: number | null | undefined,
): FitTier | null {
  if (
    vramRequiredGb == null ||
    vramAvailableGb == null ||
    vramRequiredGb <= 0 ||
    vramAvailableGb <= 0
  ) {
    return null;
  }
  const ratio = vramAvailableGb / vramRequiredGb;
  if (ratio >= 1.5) return { id: "fits", short: "Fits", label: "Fits comfortably" };
  if (ratio >= 1.0) return { id: "tight", short: "Tight", label: "Tight fit — may share VRAM with other apps" };
  if (ratio >= 0.7) return { id: "swap", short: "Partial", label: "May spill to CPU — slower" };
  return { id: "wont", short: "Won't fit", label: "Likely won't fit on this GPU" };
}

/** Order used to sort models by fit. Lower is better. */
export function fitRank(tier: FitTier | null): number {
  switch (tier?.id) {
    case "fits": return 0;
    case "tight": return 1;
    case "swap": return 2;
    case "wont": return 3;
    default: return 4;
  }
}
