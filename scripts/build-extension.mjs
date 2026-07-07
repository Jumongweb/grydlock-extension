import { build } from 'esbuild'

const entries = [
  { entry: 'src/intercept/mainWorldEntry.ts', outfile: 'dist/mainWorld.js' },
  { entry: 'src/intercept/bridgeEntry.ts', outfile: 'dist/bridge.js' },
  { entry: 'src/background/background.ts', outfile: 'dist/background.js' },
]

await Promise.all(
  entries.map(({ entry, outfile }) =>
    build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'iife',
      target: 'chrome111',
      logLevel: 'info',
    }),
  ),
)
