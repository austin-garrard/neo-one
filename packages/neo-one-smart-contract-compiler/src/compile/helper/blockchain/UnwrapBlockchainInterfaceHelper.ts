import { Node } from 'ts-simple-ast';

import { Helper } from '../Helper';
import { ScriptBuilder } from '../../sb';
import { VisitOptions } from '../../types';
import { InternalBlockchainInterfaceProperties } from './InternalBlockchainInterfaceProperties';

// Input: [objectVal]
// Output: [blockchainInterface]
export class UnwrapBlockchainInterfaceHelper extends Helper {
  public emit(sb: ScriptBuilder, node: Node, optionsIn: VisitOptions): void {
    if (!optionsIn.pushValue) {
      sb.emitOp(node, 'DROP');
      return;
    }

    const options = sb.pushValueOptions(optionsIn);
    // ['blockchain_interface', objectVal]
    sb.emitPushString(
      node,
      InternalBlockchainInterfaceProperties.BLOCKCHAIN_INTERFACE,
    );
    // [blockchainInterface]
    sb.emitHelper(node, options, sb.helpers.getInternalObjectProperty);
  }
}
