import { Node, Type } from 'ts-simple-ast';

import { ScriptBuilder } from '../../../sb';
import { VisitOptions } from '../../../types';
import { TypedHelper } from '../../common';
import { Helper } from '../../Helper';

import * as typeUtils from '../../../../typeUtils';

// Input: [val]
// Output: [string]
export class ToStringHelper extends TypedHelper {
  public emit(sb: ScriptBuilder, node: Node, options: VisitOptions): void {
    if (!options.pushValue) {
      sb.emitOp(node, 'DROP');

      return;
    }

    if (this.type !== undefined) {
      this.convertType(sb, node, options, this.type);
    } else {
      this.convertUnknown(sb, node, options);
    }
  }

  private convertType(sb: ScriptBuilder, node: Node, options: VisitOptions, type: Type): void {
    if (typeUtils.isOnlyUndefined(type)) {
      this.convertUndefined(sb, node, options);
    } else if (typeUtils.isOnlyNull(type)) {
      this.convertNull(sb, node, options);
    } else if (typeUtils.isOnlyBoolean(type)) {
      this.convertBoolean(sb, node, options);
    } else if (typeUtils.isOnlyNumber(type)) {
      this.convertNumber(sb, node, options);
    } else if (typeUtils.isOnlyString(type)) {
      this.convertString(sb, node, options);
    } else if (typeUtils.isOnlySymbol(type)) {
      this.convertSymbol(sb, node, options);
    } else if (typeUtils.isOnlyObject(type)) {
      this.convertObject(sb, node, options);
    } else {
      this.convertUnknown(sb, node, options);
    }
  }

  private convertUndefined(sb: ScriptBuilder, node: Node, _options: VisitOptions): void {
    sb.emitPushString(node, 'undefined');
  }

  private convertNull(sb: ScriptBuilder, node: Node, _options: VisitOptions): void {
    sb.emitPushString(node, 'null');
  }

  private convertBoolean(sb: ScriptBuilder, node: Node, options: VisitOptions): void {
    sb.emitHelper(
      node,
      options,
      sb.helpers.if({
        condition: () => {
          sb.emitHelper(node, options, sb.helpers.getBoolean);
        },
        whenTrue: () => {
          sb.emitPushString(node, 'true');
        },
        whenFalse: () => {
          sb.emitPushString(node, 'false');
        },
      }),
    );
  }

  private convertNumber(sb: ScriptBuilder, node: Node, options: VisitOptions): void {
    sb.emitHelper(node, options, sb.helpers.throwTypeError);
  }

  private convertString(sb: ScriptBuilder, node: Node, options: VisitOptions): void {
    sb.emitHelper(node, options, sb.helpers.getString);
  }

  private convertSymbol(sb: ScriptBuilder, node: Node, options: VisitOptions): void {
    sb.emitHelper(node, options, sb.helpers.throwTypeError);
  }

  private convertObject(sb: ScriptBuilder, node: Node, options: VisitOptions): void {
    // [primitive]
    sb.emitHelper(node, options, sb.helpers.toPrimitive({ type: this.type, preferredType: 'string' }));
    // [value]
    this.convertUnknown(sb, node, options, true);
  }

  private convertUnknown(sb: ScriptBuilder, node: Node, options: VisitOptions, shouldThrowOnObject = false): void {
    const emitIf = (check: Helper, whenTrue: () => void, whenFalse: () => void) =>
      sb.emitHelper(
        node,
        options,
        sb.helpers.if({
          condition: () => {
            // [value, value]
            sb.emitOp(node, 'DUP');
            // [isValue, value]
            sb.emitHelper(node, options, check);
          },
          whenTrue,
          whenFalse,
        }),
      );

    emitIf(
      sb.helpers.isString,
      () => this.convertString(sb, node, options),
      () =>
        emitIf(
          sb.helpers.isUndefined,
          () => this.convertUndefined(sb, node, options),
          () =>
            emitIf(
              sb.helpers.isNull,
              () => this.convertNull(sb, node, options),
              () =>
                emitIf(
                  sb.helpers.isBoolean,
                  () => this.convertBoolean(sb, node, options),
                  () =>
                    emitIf(
                      sb.helpers.isNumber,
                      () => this.convertNumber(sb, node, options),
                      () =>
                        emitIf(
                          sb.helpers.isSymbol,
                          () => this.convertSymbol(sb, node, options),
                          () => {
                            if (shouldThrowOnObject) {
                              sb.emitHelper(node, options, sb.helpers.throwTypeError);
                            } else {
                              this.convertObject(sb, node, options);
                            }
                          },
                        ),
                    ),
                ),
            ),
        ),
    );
  }
}
