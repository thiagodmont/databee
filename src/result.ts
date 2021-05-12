export interface ResultInsert {
  fieldCount: number;
  affectedRows: number;
  insertId: number;
  info: string;
  serverStatus: number;
  warningStatus: number;
}

export interface ResultUpdate extends ResultInsert {
  changedRows: number;
}

export interface IResult<T> {
  readonly all: T[];
  readonly once: T;
  hasData: boolean;
}

class Result<T> {
  readonly _data: T[];

  constructor(data: T[]) {
    this._data = data;
  }

  get all(): T[] {
    return this?._data || []
  }

  get once(): T {
    return this?._data[0] || null
  }

  get hasData(): boolean {
    return this?._data?.length > 0
  }
}

export default Result;