function toEpochMilliseconds(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === 'string' && value.trim()) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (value && typeof value === 'object') {
    const dateValue = value as { toDate?: () => Date; seconds?: unknown; _seconds?: unknown };
    if (typeof dateValue.toDate === 'function') {
      return toEpochMilliseconds(dateValue.toDate());
    }

    const seconds = Number(dateValue.seconds ?? dateValue._seconds);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }

  return null;
}

/** Date used by the catalog's "newest" sort: publish date, then creation date. */
export function getProductNewestTimestamp(product: Record<string, unknown>): number {
  for (const value of [product.WEB_PUBLISHED_AT, product.web_published_at]) {
    const timestamp = toEpochMilliseconds(value);
    if (timestamp !== null) return timestamp;
  }

  for (const value of [product.$createdAt, product.createdAt, product.created_at]) {
    const timestamp = toEpochMilliseconds(value);
    if (timestamp !== null) return timestamp;
  }

  return 0;
}
