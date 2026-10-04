import { type Node, SyntaxKind, type TypeChecker } from 'ts-morph';
import type { StaticEvaluator, StaticValue } from '../evaluator.js';
import type { ComponentControlEvidence } from '../trace.js';
import { storeEvidence } from './evidence.js';

// Recognize setting-bound JSX controls and their statically known option values
export const CONTROL_KINDS: Readonly<Record<string, ComponentControlEvidence['kind']>> = {
  Checkbox: 'boolean',
  Switch: 'boolean',
  TextInput: 'string',
  TextArea: 'string',
  FormsFormText: 'string',
  Slider: 'number',
  NumberInput: 'number',
  Select: 'enum',
  RadioGroup: 'enum',
  SearchableSelect: 'enum',
  FormSwitch: 'boolean',
};

export const jsxControl = (
  node: Node,
  settingKey: string,
  evaluator: StaticEvaluator,
  checker: TypeChecker,
  settingsBindings: readonly Node[],
  directIdentifier = false,
  assumeRelated = false,
  controlKinds: Readonly<Record<string, ComponentControlEvidence['kind']>> = CONTROL_KINDS
): ComponentControlEvidence | undefined => {
  const jsx =
    node.asKind(SyntaxKind.JsxSelfClosingElement) ?? node.asKind(SyntaxKind.JsxOpeningElement);
  if (!jsx) return undefined;
  const component = jsx.getTagNameNode().getText().split('.').at(-1) ?? '';
  const kind = controlKinds[component];
  if (!kind) return undefined;
  const referencesSetting = jsx.getAttributes().some((attribute) => {
    const expression = attribute
      .asKind(SyntaxKind.JsxAttribute)
      ?.getInitializer()
      ?.asKind(SyntaxKind.JsxExpression)
      ?.getExpression();
    if (!expression) return false;
    const evidence = storeEvidence(expression, settingKey, evaluator, checker, settingsBindings);
    return (
      assumeRelated ||
      evidence.read ||
      evidence.write ||
      (directIdentifier &&
        [expression, ...expression.getDescendants()].some(
          (candidate) =>
            candidate.isKind(SyntaxKind.Identifier) && candidate.getText() === settingKey
        ))
    );
  });
  if (!referencesSetting) return undefined;

  const optionsAttribute = jsx
    .getAttributes()
    .find(
      (attribute) =>
        attribute.asKind(SyntaxKind.JsxAttribute)?.getNameNode().getText() === 'options'
    )
    ?.asKind(SyntaxKind.JsxAttribute)
    ?.getInitializer()
    ?.asKind(SyntaxKind.JsxExpression)
    ?.getExpression();
  const options = optionsAttribute ? evaluator.evaluate(optionsAttribute) : undefined;
  const values =
    options?.known && Array.isArray(options.value)
      ? options.value
          .map((item) =>
            item && typeof item === 'object' && !Array.isArray(item)
              ? (item as Record<string, StaticValue>).value
              : item
          )
          .filter((value): value is string | number | boolean =>
            ['string', 'number', 'boolean'].includes(typeof value)
          )
      : undefined;
  return { component, kind, ...(values?.length ? { values } : {}) };
};
