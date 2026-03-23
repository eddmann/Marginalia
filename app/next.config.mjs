import withBundleAnalyzer from '@next/bundle-analyzer';

const isDev = process.env['NODE_ENV'] === 'development';

const exportOutput = !isDev;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: exportOutput ? 'export' : undefined,
  pageExtensions: exportOutput ? ['jsx', 'tsx'] : ['js', 'jsx', 'ts', 'tsx'],
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  assetPrefix: '',
  reactStrictMode: true,
  serverExternalPackages: ['@mariozechner/pi-ai', '@mariozechner/pi-agent-core', '@anthropic-ai/sdk'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      nunjucks: 'nunjucks/browser/nunjucks.js',
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      nunjucks: 'nunjucks/browser/nunjucks.js',
    },
  },
  transpilePackages: [
    ...(isDev
      ? []
      : [
          'i18next-browser-languagedetector',
          'react-i18next',
          'i18next',
          '@tauri-apps',
          'highlight.js',
          'foliate-js',
          'marked',
        ]),
  ],
};

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withAnalyzer(nextConfig);
