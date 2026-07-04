export interface DisposableStrokeEntity {
  dispose(): void;
}

export class StrokeEntityHistory<T extends DisposableStrokeEntity> {
  private readonly undoGroups: T[][] = [];
  private readonly redoGroups: T[][] = [];

  get undoDepth(): number {
    return this.undoGroups.length;
  }

  get redoDepth(): number {
    return this.redoGroups.length;
  }

  commit(group: readonly T[]): void {
    this.clearRedo();
    if (group.length > 0) {
      this.undoGroups.push([...group]);
    }
  }

  undo(): T[] | undefined {
    const group = this.undoGroups.pop();
    if (!group) {
      return undefined;
    }
    this.redoGroups.push(group);
    return group;
  }

  redo(): T[] | undefined {
    const group = this.redoGroups.pop();
    if (!group) {
      return undefined;
    }
    this.undoGroups.push(group);
    return group;
  }

  clearRedo(): number {
    return this.disposeStack(this.redoGroups);
  }

  clearAll(): number {
    return this.disposeStack(this.redoGroups) + this.disposeStack(this.undoGroups);
  }

  private disposeStack(stack: T[][]): number {
    let disposedCount = 0;
    for (const group of stack.splice(0)) {
      for (const entity of group) {
        entity.dispose();
        disposedCount += 1;
      }
    }
    return disposedCount;
  }
}
