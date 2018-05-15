import {
  ClassDeclaration,
  SyntaxKind,
  TypeGuards,
  ParameterDeclaration,
  MethodDeclaration,
  Scope,
} from 'ts-simple-ast';

import { NodeTranspiler } from '../NodeTranspiler';
import { Transpiler } from '../transpiler';
import * as typeUtils from '../../typeUtils';
import { DiagnosticCode } from '../../DiagnosticCode';

const DEPLOY_METHOD = 'deploy';

export class ClassDeclarationTranspiler extends NodeTranspiler<
  ClassDeclaration
> {
  public readonly kind: SyntaxKind = SyntaxKind.ClassDeclaration;

  public visitNode(transpiler: Transpiler, node: ClassDeclaration): void {
    if (transpiler.isSmartContract(node)) {
      this.transpileSmartContract(transpiler, node);
    }
  }

  private transpileSmartContract(
    transpiler: Transpiler,
    node: ClassDeclaration,
  ): void {
    transpiler.visit(node.getBaseClass());

    this.transpileDeploy(transpiler, node);
  }

  // TODO: Lots of edge cases to handle here. E.g. readonly constructor properties
  private transpileDeploy(
    transpiler: Transpiler,
    node: ClassDeclaration,
  ): void {
    const existingDeploy = node.getMethod(DEPLOY_METHOD);
    if (existingDeploy != null) {
      transpiler.reportError(
        existingDeploy,
        'The deploy method is reserved in SmartContract instances.',
        DiagnosticCode.UNSUPPORTED_SYNTAX,
      );
      return;
    }

    const ctor = node
      .getConstructors()
      .find((ctorDecl) => ctorDecl.isImplementation());
    let bodyText = '';
    let parameters: ParameterDeclaration[] = [];
    if (ctor == null) {
      const baseDeploy = this.getBaseDeploy(transpiler, node);
      if (baseDeploy != null) {
        bodyText = `
          super.deploy(${baseDeploy
            .getParameters()
            .map((param) => param.getName())
            .join(', ')});
        `;
        parameters = baseDeploy.getParameters();
      }
    } else {
      const firstStatement = ctor.getStatements()[0];
      if (
        firstStatement != null &&
        TypeGuards.isExpressionStatement(firstStatement)
      ) {
        const callExpr = firstStatement.getExpression();
        if (TypeGuards.isCallExpression(callExpr)) {
          const lhsrExpr = callExpr.getExpression();
          if (TypeGuards.isSuperExpression(lhsrExpr)) {
            // TODO: Handle case where constructor needs keep some statements
            firstStatement.replaceWithText(
              `super.deploy(${callExpr
                .getArguments()
                .map((arg) => arg.getText())
                .join(', ')});`,
            );
          }
        }
      }

      bodyText = ctor
        .getStatements()
        .map((statement) => statement.getText())
        .join('\n');
      parameters = ctor.getParameters();
    }

    const deploy = node.addMethod({
      name: DEPLOY_METHOD,
      returnType: 'boolean',
      bodyText,
      parameters: parameters.map((param) => {
        const initializer = param.getInitializer();
        let type = param.getType().getText();
        const typeNode = param.getTypeNode();
        if (typeNode != null) {
          type = typeNode.getText();
        }
        return {
          name: param.getNameOrThrow(),
          type,
          initializer: initializer == null ? undefined : initializer.getText(),
          hasQuestionToken: param.hasQuestionToken(),
          isRestParameter: param.isRestParameter(),
        };
      }),
      scope: Scope.Public,
    });

    node.getInstanceProperties().forEach((property) => {
      if (
        (TypeGuards.isPropertyDeclaration(property) &&
          !property.isAbstract()) ||
        TypeGuards.isParameterDeclaration(property)
      ) {
        const name = TypeGuards.isPropertyDeclaration(property)
          ? property.getName()
          : property.getNameOrThrow();
        const type = property.getType();
        const typeNode = property.getTypeNode();

        if (type == null || typeNode == null) {
          transpiler.reportError(
            property,
            'Could not determine type of property.',
            DiagnosticCode.UNKNOWN_TYPE,
          );
        } else if (
          typeUtils.isOnlyPrimitive(type) ||
          transpiler.isFixedType(property, type) ||
          transpiler.isOnlyGlobal(property, type, 'Buffer')
        ) {
          if (TypeGuards.isParameterDeclaration(property)) {
            deploy.addStatements(`
              this.${property.getName()} = ${property.getName()};
            `);
          }

          const init = property.getInitializer();
          let addAccessors = true;
          if (TypeGuards.isPropertyDeclaration(property) && init != null) {
            if (property.isReadonly()) {
              addAccessors = false;
            } else {
              deploy.addStatements(`
                this.${property.getName()} = ${init.getText()};
              `);
            }
          }

          if (addAccessors) {
            node.addGetAccessor({
              name,
              returnType: typeNode.getText(),
              bodyText: `
              return syscall('Neo.Storage.Get', syscall('Neo.Storage.GetContext'), '${name}') as ${typeNode.getText()};
              `,
              scope: property.getScope(),
            });
            node.addSetAccessor({
              name,
              parameters: [
                {
                  name,
                  type: typeNode.getText(),
                },
              ],
              bodyText: `
              syscall('Neo.Storage.Put', syscall('Neo.Storage.GetContext'), '${name}', ${name});
              `,
              scope: property.getScope(),
            });
            property.remove();
          }
        } else if (transpiler.isOnlyLib(property, type, 'MapStorage')) {
          property.setInitializer(
            `new MapStorage(syscall('Neo.Runtime.Serialize', '${name}'))`,
          );
        } else if (transpiler.isOnlyLib(property, type, 'SetStorage')) {
          property.setInitializer(
            `new SetStorage(syscall('Neo.Runtime.Serialize', '${name}'))`,
          );
        } else {
          transpiler.reportError(
            property,
            'Unsupported SmartContract property.',
            DiagnosticCode.UNSUPPORTED_SYNTAX,
          );
        }
      }
    });

    deploy.addStatements(`
      return true;
    `);

    if (ctor != null) {
      // TODO: Handle case where constructor needs keep some statements
      ctor.remove();
    }
  }

  private getBaseDeploy(
    transpiler: Transpiler,
    node: ClassDeclaration,
  ): MethodDeclaration | undefined {
    const baseClass = node.getBaseClass();
    if (baseClass == null) {
      return undefined;
    }

    const deploy = baseClass.getInstanceMethod('deploy');
    if (deploy == null) {
      return this.getBaseDeploy(transpiler, baseClass);
    }

    return deploy;
  }
}
