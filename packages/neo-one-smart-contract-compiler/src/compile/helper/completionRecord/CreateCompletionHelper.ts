import { Node } from 'ts-simple-ast';

import { Helper } from '../Helper';
import { ScriptBuilder } from '../../sb';
import { VisitOptions } from '../../types';

// Input: [val, errorVal]
// Output: [completion]
export class CreateCompletionHelper extends Helper<Node> {
  public emit(sb: ScriptBuilder, node: Node, options: VisitOptions): void {
    if (!options.pushValue) {
      sb.emitOp(node, 'DROP');
      sb.emitOp(node, 'DROP');
      return;
    }

    // [2, val, errorVal]
    sb.emitPushInt(node, 2);
    // [completion]
    sb.emitOp(node, 'PACK');
  }
}
