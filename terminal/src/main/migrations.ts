/**
 * Versioned local data format (`format.json` in the data directory).
 *
 * RULE: Fields are only ever ADDED. Renaming or removing a field is only allowed through a
 * migration below. A new required field gets a default value when it is read, so data written
 * by an older version stays readable.
 *
 * To change the format incompatibly: raise CURRENT_FORMAT by one and add a migration with
 * `from` = the previous format. It converts the files in `dir` from `from` to `from + 1`.
 */

export const CURRENT_FORMAT = 1;

export interface Migration {
  /** The format this migration upgrades from (to `from + 1`). */
  from: number;
  run(dir: string): Promise<void>;
}

export const MIGRATIONS: Migration[] = [];

export class FormatTooNewError extends Error {
  constructor() {
    super("Lokale Daten stammen von einer neueren Version – bitte aktuelle Version installieren");
    this.name = "FormatTooNewError";
  }
}
