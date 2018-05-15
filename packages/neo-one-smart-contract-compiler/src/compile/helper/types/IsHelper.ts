import { Node } from 'ts-simple-ast';

import { Helper } from '../Helper';
import { ScriptBuilder } from '../../sb';
import { VisitOptions } from '../../types';
import { Types } from './Types';

// Input: [val]
// Output: [boolean]
export abstract class IsHelper extends Helper<Node> {
  protected abstract type: Types;

  public emit(sb: ScriptBuilder, node: Node, options: VisitOptions): void {
    if (!options.pushValue) {
      sb.emitOp(node, 'DROP');
      return;
    }

    // [0, value]
    sb.emitPushInt(node, 0);
    // [type]
    sb.emitOp(node, 'PICKITEM');
    // [type, type]
    sb.emitPushInt(node, this.type);
    // [isType]
    sb.emitOp(node, 'EQUAL');
  }
}
