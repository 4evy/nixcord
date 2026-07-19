type Rule = { id: string };
const makeEmptyRuleArray = () => [];

const typed = { default: [] as Rule[] };
const fromFactory = { default: makeEmptyRuleArray() };
const withoutAnnotation = { default: [] };
