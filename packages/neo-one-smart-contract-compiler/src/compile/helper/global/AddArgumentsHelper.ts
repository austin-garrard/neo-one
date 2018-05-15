import { Node } from 'ts-simple-ast';

import { Helper } from '../Helper';
import { ScriptBuilder } from '../../sb';
import { VisitOptions } from '../../types';
import { InternalGlobalProperties } from './InternalGlobalProperties';

// Input: [argv, globalObjectVal]
// Output: []
export class AddArgumentsHelper extends Helper<Node> {
  public emit(sb: ScriptBuilder, node: Node, optionsIn: VisitOptions): void {
    const options = sb.pushValueOptions(optionsIn);
    // ['arguments', argv, globalObjectVal]
    sb.emitPushString(node, InternalGlobalProperties.ARGUMENTS);
    // [argv, 'arguments', globalObjectVal]
    sb.emitOp(node, 'SWAP');
    // []
    sb.emitHelper(node, options, sb.helpers.setInternalObjectProperty);
  }
}
