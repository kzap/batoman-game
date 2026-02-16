export class ObjectPool<T extends { setActive(v: boolean): T; setVisible(v: boolean): T }> {
  private available: T[] = [];

  constructor(
    private readonly factory: () => T,
    private readonly reset: (obj: T) => void,
    initialSize: number,
  ) {
    for (let i = 0; i < initialSize; i++) {
      const obj = factory();
      obj.setActive(false).setVisible(false);
      this.available.push(obj);
    }
  }

  acquire(): T {
    const obj = this.available.pop() ?? this.factory();
    return obj.setActive(true).setVisible(true);
  }

  release(obj: T): void {
    this.reset(obj);
    obj.setActive(false).setVisible(false);
    this.available.push(obj);
  }

  get size() { return this.available.length; }
}
