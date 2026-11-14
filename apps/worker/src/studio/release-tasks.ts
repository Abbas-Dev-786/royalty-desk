type TaskState<T> = { readonly pending: true } | { readonly pending: false; readonly result: T } | { readonly pending: false; readonly error: string };

/** Coalesce HTTP polling into one running operation. Chain operations remain persisted separately. */
export class ReleaseTasks<T> {
  readonly #tasks = new Map<string, { state: TaskState<T>; updatedAt: number }>();

  poll(key: string, execute: () => Promise<T>): TaskState<T> {
    for (const [id, entry] of this.#tasks) {
      if (!entry.state.pending && Date.now() - entry.updatedAt > 600_000) this.#tasks.delete(id);
    }
    const existing = this.#tasks.get(key);
    if (existing) {
      if (!existing.state.pending) this.#tasks.delete(key);
      return existing.state;
    }
    if (this.#tasks.size >= 100) return { pending: false, error: "ERR_RELEASE_QUEUE_BUSY" };
    const entry: { state: TaskState<T>; updatedAt: number } = { state: { pending: true }, updatedAt: Date.now() };
    this.#tasks.set(key, entry);
    void Promise.resolve().then(execute).then(
      (result) => { entry.state = { pending: false, result }; entry.updatedAt = Date.now(); },
      (error: unknown) => { entry.state = { pending: false, error: error instanceof Error ? error.message : "ERR_RELEASE_FAILED" }; entry.updatedAt = Date.now(); }
    );
    return { pending: true };
  }
}
