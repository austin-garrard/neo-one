import { Node } from 'ts-simple-ast';

import { ScriptBuilder } from '../../sb';
import { VisitOptions } from '../../types';
import { InternalGlobalProperties } from './InternalGlobalProperties';
import { TypedHelper } from '../common';

// Input: [numberVal]
// Output: [value]
export class GetArgumentHelper extends TypedHelper {
  public emit(sb: ScriptBuilder, node: Node, options: VisitOptions): void {
    if (!options.pushValue) {
      sb.emitOp(node, 'DROP');
      return;
    }
    // [globalObjectVal, numberVal]
    sb.scope.getGlobal(sb, node, options);
    // [arguments, globalObjectVal, numberVal]
    sb.emitPushString(node, InternalGlobalProperties.ARGUMENTS);
    // [argv, numberVal]
    sb.emitHelper(node, options, sb.helpers.getInternalObjectProperty);
    // [numberVal, argv]
    sb.emitOp(node, 'SWAP');
    // TODO: This should really be toNumber
    // [number, argv]
    sb.emitHelper(node, options, sb.helpers.toNumber({ type: this.type }));
    // [value]
    sb.emitOp(node, 'PICKITEM');
  }
}
