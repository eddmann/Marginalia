import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/app/**/*.{ts,tsx}', 'src/pages/**/*.{ts,tsx}'],
  project: ['src/**/*.{ts,tsx}'],
  ignore: [],
  ignoreDependencies: [
    '@tauri-apps/*',
    'foliate-js',
    'styled-jsx',
  ],
};

export default config;
