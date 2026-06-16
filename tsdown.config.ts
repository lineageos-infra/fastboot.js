import { defineConfig, type UserConfig } from 'tsdown'

const outExtensions = ({ format }: { format: string }) => ({
  js: format === 'cjs' ? '.cjs' : '.mjs'
})

const shared = {
  format: ['es', 'cjs'],
  platform: 'browser',
  sourcemap: true,
  deps: { alwaysBundle: [/.*/], onlyBundle: false },
  outExtensions
} satisfies UserConfig

export default defineConfig([
  {
    ...shared,
    entry: { fastboot: 'src/index.ts' },
    dts: true
  },
  {
    ...shared,
    entry: { 'fastboot.min': 'src/index.ts' },
    minify: true,
    dts: false
  }
])
