import { Node } from 'ts-simple-ast';

import { Helper } from '../Helper';
import { ScriptBuilder } from '../../sb';
import { VisitOptions } from '../../types';

export interface CreateFunctionArrayHelperOptions {
  body: () => void;
}

// Input: []
// Output: [farr]
export class CreateFunctionArrayHelper extends Helper<Node> {
  private body: () => void;

  constructor({ body }: CreateFunctionArrayHelperOptions) {
    super();
    this.body = body;
  }

  public emit(sb: ScriptBuilder, node: Node, options: VisitOptions): void {
    if (options.pushValue) {
      // TODO: This might break if this/global change after copying?
      /* create function */
      // [[scopes, this]]
      sb.scope.pushAll(sb, node, options);
      // [[scopes, this]]
      sb.emitHelper(node, options, sb.helpers.cloneArray);
      // [[scopes, this], [scopes, this]]
      sb.emitOp(node, 'DUP');
      // [0, [scopes, this], [scopes, this]]
      sb.emitPushInt(node, 0);
      // [[scopes, this], 0, [scopes, this], [scopes, this]]
      sb.emitOp(node, 'OVER');
      // [0, [scopes, this], 0, [scopes, this], [scopes, this]]
      sb.emitOp(node, 'OVER');
      // [scopes, 0, [scopes, this], [scopes, this]]
      sb.emitOp(node, 'PICKITEM');
      // [scopes, 0, [scopes, this], [scopes, this]]
      sb.emitHelper(node, options, sb.helpers.cloneArray);
      // [[scopes, this]]
      sb.emitOp(node, 'SETITEM');
      // [target, scopes]
      sb.emitHelper(node, options, sb.helpers.function({ body: this.body }));
      // [2, target, scopes]
      sb.emitPushInt(node, 2);
      // [arr]
      sb.emitOp(node, 'PACK');
    }
  }
}
