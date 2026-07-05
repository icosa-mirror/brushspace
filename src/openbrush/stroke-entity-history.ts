export interface DisposableStrokeEntity {
  dispose(): void;
}

export type StrokeEntityHistoryOperationKind = "create" | "erase";

export interface StrokeEntityHistoryOperation<T extends DisposableStrokeEntity> {
  kind: StrokeEntityHistoryOperationKind;
  group: T[];
}

export class StrokeEntityHistory<T extends DisposableStrokeEntity> {
  private readonly undoGroups: StrokeEntityHistoryOperation<T>[] = [];
  private readonly redoGroups: StrokeEntityHistoryOperation<T>[] = [];

  get undoDepth(): number {
    return this.undoGroups.length;
  }

  get redoDepth(): number {
    return this.redoGroups.length;
  }

  commit(group: readonly T[]): void {
    this.commitCreated(group);
  }

  commitCreated(group: readonly T[]): void {
    this.clearRedo();
    if (group.length > 0) {
      this.undoGroups.push({ kind: "create", group: [...group] });
    }
  }

  commitErased(group: readonly T[]): void {
    this.clearRedo();
    if (group.length > 0) {
      this.undoGroups.push({ kind: "erase", group: [...group] });
    }
  }

  undo(): T[] | undefined {
    return this.undoOperation()?.group;
  }

  undoOperation(): StrokeEntityHistoryOperation<T> | undefined {
    const operation = this.undoGroups.pop();
    if (!operation) {
      return undefined;
    }
    this.redoGroups.push(operation);
    return operation;
  }

  redo(): T[] | undefined {
    return this.redoOperation()?.group;
  }

  redoOperation(): StrokeEntityHistoryOperation<T> | undefined {
    const operation = this.redoGroups.pop();
    if (!operation) {
      return undefined;
    }
    this.undoGroups.push(operation);
    return operation;
  }

  clearRedo(): number {
    return this.disposeCreateOperations(this.redoGroups);
  }

  clearAll(): number {
    return this.disposeUniqueOperations(this.redoGroups, this.undoGroups);
  }

  private disposeCreateOperations(
    stack: StrokeEntityHistoryOperation<T>[],
  ): number {
    let disposedCount = 0;
    for (const operation of stack.splice(0)) {
      if (operation.kind !== "create") {
        continue;
      }
      for (const entity of operation.group) {
        entity.dispose();
        disposedCount += 1;
      }
    }
    return disposedCount;
  }

  private disposeUniqueOperations(
    ...stacks: StrokeEntityHistoryOperation<T>[][]
  ): number {
    const entities = new Set<T>();
    for (const stack of stacks) {
      for (const operation of stack.splice(0)) {
        for (const entity of operation.group) {
          entities.add(entity);
        }
      }
    }
    for (const entity of entities) {
      entity.dispose();
    }
    return entities.size;
  }
}
