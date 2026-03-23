import * as React from 'react';
import { ViewTransitions } from 'next-view-transitions';
import { EnvProvider } from '@/context/EnvContext';
import Providers from '@/components/Providers';

import '../styles/globals.css';

const title = 'Marginalia — Read with AI';
const description =
  'Marginalia is an ebook reader for immersive and organized reading. ' +
  'Enjoy seamless access to your digital library, powerful tools for highlighting, bookmarking, ' +
  'and note-taking, and support for multiple book views. ' +
  'Perfect for deep reading, analysis, and understanding.';

export const metadata = {
  title,
  description,
  generator: 'Next.js',
  keywords: ['epub', 'pdf', 'ebook', 'reader', 'marginalia', 'pwa'],
  authors: [
    {
      name: 'Marginalia',
    },
  ],
  icons: [
    { rel: 'apple-touch-icon', url: '/apple-touch-icon.png' },
    { rel: 'icon', url: '/icon.png' },
  ],
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang='en'
      className='edge-to-edge'
    >
      <head>
        <title>{title}</title>
        <meta
          name='viewport'
          content='minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, user-scalable=no, viewport-fit=cover'
        />
        <meta name='mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-status-bar-style' content='default' />
        <meta name='apple-mobile-web-app-title' content='Marginalia' />
        <link rel='apple-touch-icon' sizes='180x180' href='/apple-touch-icon.png' />
        <link rel='icon' href='/favicon.ico' />
        <meta name='description' content={description} />
        <meta property='og:type' content='website' />
        <meta property='og:title' content={title} />
        <meta property='og:description' content={description} />
      </head>
      <body>
        <ViewTransitions>
          <EnvProvider>
            <Providers>{children}</Providers>
          </EnvProvider>
        </ViewTransitions>
      </body>
    </html>
  );
}
