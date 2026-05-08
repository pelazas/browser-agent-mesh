import * as Y from 'yjs';

type PathWatcher = {
  paths: string[];
  callback: (events: Y.YEvent<unknown>[]) => void;
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
    callback: (events: Y.YEvent<unknown>[]) => void,
    opts?: { filter?: (value: unknown) => boolean },
  ): () => void {
    const rootKey = this.getRootKey(path);

    if (!this.watchers.has(rootKey)) {
      this.watchers.set(rootKey, []);

      const root = this.doc.getMap(rootKey);
      const unsubscribe = root.observe((events, transaction) => {
        // Pass through all events; filtering happens per-watcher
        const watchers = this.watchers.get(rootKey) ?? [];
        for (const w of watchers) {
          if (this.matchesPath(path, events)) {
            w.callback(events);
          }
        }
      });

      this.unsubscribeMap.set(rootKey, unsubscribe);
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

  private matchesPath(path: string, events: Y.YEvent<unknown>[]): boolean {
    const parts = path.split('.');
    for (const event of events) {
      const eventPath = this.getEventPath(event);
      if (this.pathMatches(parts, eventPath)) return true;
    }
    return false;
  }

  private getEventPath(event: Y.YEvent<unknown>): string[] {
    const path: string[] = [];
    // Walk up the Yjs parent chain
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = event.target;
    while (current) {
      if (current instanceof Y.Map) {
        // Find the key we came from
        const parent = current.doc ? this.findKeyInParent(current) : null;
        if (parent) path.unshift(parent);
      } else if (current instanceof Y.Array) {
        // Find the key we came from
        const parent = this.findKeyInParent(current);
        if (parent) path.unshift(parent);
      }
      current = current._parent ?? null;
    }
    return path;
  }

  private findKeyInParent(child: Y.AbstractType<unknown>): string | null {
    // Search through the doc's top-level maps
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
