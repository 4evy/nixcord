const Values = { First: 'value1', Second: 'value2' } as const;
const obj = { options: Object.values(Values).map((v) => ({ value: v })) };
