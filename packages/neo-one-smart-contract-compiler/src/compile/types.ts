import { Type } from 'ts-simple-ast';

import { ProgramCounter } from './pc';
import { Name } from './scope';
import { Context } from '../Context';

export interface VisitOptions {
  pushValue?: boolean | undefined;
  setValue?: boolean | undefined;
  catchPC?: ProgramCounter | undefined;
  breakPC?: ProgramCounter | undefined;
  continuePC?: ProgramCounter | undefined;
  switchExpressionType?: Type | undefined;
  cast?: Type | undefined;
  superClass?: Name | undefined;
}

export interface CompileResult {
  code: Buffer;
  context: Context;
}
