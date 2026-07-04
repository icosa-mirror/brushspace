export interface UiCommand {
  name: string;
  redo(): void;
  undo(): void;
}

export interface UiCommandHistorySummary {
  undoDepth: number;
  redoDepth: number;
  historyRevision: number;
  lastCommandName: string;
}

export class UiCommandHistory {
  private readonly undoStack: UiCommand[] = [];
  private readonly redoStack: UiCommand[] = [];
  private historyRevision = 0;
  private lastCommandName = "";

  execute(command: UiCommand): void {
    command.redo();
    this.undoStack.push(command);
    this.redoStack.length = 0;
    this.lastCommandName = command.name;
    this.historyRevision += 1;
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) {
      return false;
    }
    command.undo();
    this.redoStack.push(command);
    this.lastCommandName = `undo:${command.name}`;
    this.historyRevision += 1;
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) {
      return false;
    }
    command.redo();
    this.undoStack.push(command);
    this.lastCommandName = `redo:${command.name}`;
    this.historyRevision += 1;
    return true;
  }

  summarize(): UiCommandHistorySummary {
    return {
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
      historyRevision: this.historyRevision,
      lastCommandName: this.lastCommandName,
    };
  }
}
