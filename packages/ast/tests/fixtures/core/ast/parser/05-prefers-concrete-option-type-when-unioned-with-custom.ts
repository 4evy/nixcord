enum OptionType {
  STRING = 0,
  NUMBER = 1,
  CUSTOM = 7,
}
const obj = { type: OptionType.NUMBER | OptionType.CUSTOM, default: 42 };
