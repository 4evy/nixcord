export const CLI_CONFIG = {
  version: '1.0.0',
  directories: {
    output: 'plugins',
    vencordPlugins: 'src/plugins',
    equicordPlugins: 'src/equicordplugins',
  },
  sources: {
    vencord: 'node_modules/vencord',
    equicord: 'node_modules/equicord',
  },
  filenames: {
    packageJson: 'package.json',
    parseRules: 'parse-rules.json',
    deprecated: 'deprecated.json',
    migrations: 'migrations.json',
  },
  symbols: {
    success: '✓',
  },
} as const;
