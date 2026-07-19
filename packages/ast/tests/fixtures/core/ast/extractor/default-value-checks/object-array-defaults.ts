const makeRules = () => [{ label: 'one' }, { label: 'two' }];
const RAW = [{ id: 1 }, { id: 2 }];
const NUMS = [1, 2, 3];

const fromCall = { default: makeRules() };
const fromIdentifier = { default: RAW };
const notObjects = { default: NUMS };
