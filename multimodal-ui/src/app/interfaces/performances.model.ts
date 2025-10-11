export class SortedList<T> {
  private _items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  public add(item: T): void {
    const index = this.findInsertionIndex(item);

    this._items.splice(index, 0, item);
  }

  public shift(): T | undefined {
    return this._items.shift();
  }

  public remove(item: T): void {
    const startIndex = this.findFirstEqualIndex(item);

    if (startIndex === null) {
      // Item not in list
      return;
    }

    const index = this._items.indexOf(item, startIndex);

    if (index !== -1) {
      this._items.splice(index, 1);
    }
  }

  public get length(): number {
    return this._items.length;
  }

  public get items(): readonly T[] {
    return this._items;
  }

  public get editableItems(): T[] {
    return this._items;
  }

  private findInsertionIndex(item: T): number {
    let low = 0;
    let high = this._items.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const comparison = this.compare(this._items[mid], item);

      if (comparison < 0) {
        low = mid + 1;
      } else if (comparison > 0) {
        high = mid - 1;
      } else {
        return mid; // Exact match found
      }
    }

    return low; // Insertion point
  }

  private findFirstEqualIndex(item: T): number | null {
    let low = 0;
    let high = this._items.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const comparison = this.compare(this._items[mid], item);

      if (comparison < 0) {
        low = mid + 1;
      } else if (comparison > 0) {
        high = mid - 1;
      } else {
        high = mid;
      }
    }

    const lowComparison = this.compare(this._items[low], item);

    if (lowComparison === 0) {
      return low;
    }

    const highComparison = this.compare(this._items[high], item);

    if (highComparison === 0) {
      return high;
    }

    return null;
  }
}
