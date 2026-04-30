export function percent(used: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Math.round((used / total) * 100);
}

