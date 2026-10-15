declare module 'virtual:nixcord-plugin-metadata' {
  const metadata: Record<string, Record<string, { settings: Record<string, unknown> }>>;
  export default metadata;
}
