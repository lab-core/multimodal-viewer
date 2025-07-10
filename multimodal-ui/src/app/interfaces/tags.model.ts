export interface Tagged {
  tags: string[];
}

export function isTagged(value: unknown): value is Tagged {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tags' in value &&
    Array.isArray((value as Tagged).tags) &&
    (value as Tagged).tags.every((tag) => typeof tag === 'string')
  );
}
