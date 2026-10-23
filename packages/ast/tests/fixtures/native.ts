import {
  type AnalysisSession,
  createAnalysisSession,
  type Node,
  type TypeChecker,
} from '@nixcord/typescript-analysis';
import { afterEach } from 'vitest';

const fixtures = new Set<NativeFixture>();
afterEach(async () => {
  await Promise.all([...fixtures].map((fixture) => fixture.dispose()));
  fixtures.clear();
});

export class NativeFixture {
  readonly sources: Record<string, string> = {};
  session?: AnalysisSession;
  constructor() {
    fixtures.add(this);
  }
  async openFile(path: string, source: string): Promise<Node> {
    this.sources[path] = source;
    await this.session?.dispose();
    this.session = await createAnalysisSession({
      rootPath: process.cwd(),
      filePaths: Object.keys(this.sources),
      sources: this.sources,
    });
    return this.session.getSourceFile(path)!;
  }
  get checker(): TypeChecker {
    if (!this.session) throw new Error('Open a fixture source before reading the checker');
    return this.session.checker;
  }
  async dispose(): Promise<void> {
    await this.session?.dispose();
  }
}
