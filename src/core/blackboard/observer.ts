import * as Y from 'yjs';

type PathWatcher = {
  paths: string[];
  callback: (events: Y.YEvent<Y.AbstractType<any>>[]) => void;
  filter?: (value: unknown) => boolean;
};

export class BlackboardObserver {
  private doc: Y.Doc;
  private watchers: Map<string, PathWatcher[]> = new Map();
  private unsubscribeMap: Map<string, () => void> = new Map();

  constructor(doc: Y.Doc) {
    this.doc = doc;
  }

  watch(
    path: string,
    callback: (events: Y.YEvent<Y.AbstractType<any>>[]) => void,
    opts?: { filter?: (value: unknown) => boolean },
  ): () => void {
    const rootKey = this.getRootKey(path);

    if (!this.watchers.has(rootKey)) {
      this.watchers.set(rootKey, []);

      const root = this.doc.getMap(rootKey);
      // Yjs observe() returns void in current version; store the callback so we can unobserve
      const handler = (event: Y.YMapEvent<unknown>) => {
        const watchers = this.watchers.get(rootKey) ?? [];
        for (const w of watchers) {
          if (this.matchesPath(path, [event])) {
            w.callback([event] as unknown as Y.YEvent<Y.AbstractType<any>>[]);
          }
        }
      };
      root.observe(handler);

      this.unsubscribeMap.set(rootKey, () => root.unobserve(handler));
    }

    const watcher: PathWatcher = { paths: path.split('.'), callback, filter: opts?.filter };
    this.watchers.get(rootKey)!.push(watcher);

    return () => {
      this.removeWatcher(rootKey, watcher);
    };
  }

  private getRootKey(path: string): string {
    return path.split('.')[0];
  }

  private matchesPath(path: string, events: Y.YEvent<Y.AbstractType<any>>[]): boolean {
    const parts = path.split('.');
    for (const event of events) {
      const eventPath = this.getEventPath(event);
      if (this.pathMatches(parts, eventPath)) return true;
    }
    return false;
  }

  private getEventPath(event: Y.YEvent<Y.AbstractType<any>>): string[] {
    const path: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = event.target;
    while (current) {
      if (current instanceof Y.Map) {
        const parent = current.doc ? this.findKeyInParent(current) : null;
        if (parent) path.unshift(parent);
      } else if (current instanceof Y.Array) {
        const parent = this.findKeyInParent(current);
        if (parent) path.unshift(parent);
      }
      current = current._parent ?? null;
    }
    return path;
  }

  private findKeyInParent(child: Y.AbstractType<any>): string | null {
    for (const [name, type] of this.doc.share.entries()) {
      if (type === child) return name;
    }
    return null;
  }

  private pathMatches(pattern: string[], actual: string[]): boolean {
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === '*') continue;
      if (pattern[i] === '**') return true;
      if (i >= actual.length) return false;
      if (pattern[i] !== actual[i]) return false;
    }
    return pattern.length === actual.length;
  }

  private removeWatcher(rootKey: string, watcher: PathWatcher): void {
    const watchers = this.watchers.get(rootKey);
    if (!watchers) return;

    const idx = watchers.indexOf(watcher);
    if (idx >= 0) watchers.splice(idx, 1);

    if (watchers.length === 0) {
      const unsub = this.unsubscribeMap.get(rootKey);
      unsub?.();
      this.watchers.delete(rootKey);
      this.unsubscribeMap.delete(rootKey);
    }
  }

  destroy(): void {
    for (const unsub of this.unsubscribeMap.values()) {
      unsub();
    }
    this.watchers.clear();
    this.unsubscribeMap.clear();
  }
}
