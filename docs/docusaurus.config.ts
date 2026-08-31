import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Erghi SDK Documentation',
  tagline: 'Real-time Chat and Messaging Infrastructure',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Deployed to Cloudflare Pages (project "erghi-docs") with a custom domain,
  // not GitHub Pages -- see .github/workflows/deploy-docs.yml.
  url: 'https://docs.erghi.ai',
  baseUrl: '/',

  // Only used if someone runs the legacy `npm run deploy` (docusaurus deploy)
  // script, which pushes to a gh-pages branch -- not part of the actual CI
  // pipeline, which deploys via Cloudflare Pages instead. Left set so that
  // fallback script doesn't error out if ever run manually.
  organizationName: 'ErghiPlatform',
  projectName: 'erghi-sdks',

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/ErghiPlatform/erghi-sdks/tree/main/docs/',
        },
        // No blog content exists (2026-08-31 audit) -- the scaffolded blog/ dir
        // and every nav/footer link to /blog were dead ends for a real visitor.
        // Turn this back on with real posts if that ever changes; until then a
        // missing feature beats a broken one.
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Erghi Docs',
      logo: {
        alt: 'Erghi Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://erghi.ai',
          label: 'erghi.ai',
          position: 'right',
        },
        {
          href: 'https://github.com/ErghiPlatform/erghi-sdks',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Getting Started', to: '/docs/intro'},
            {label: 'User Guide', to: '/docs/USER_GUIDE'},
            {label: 'API Reference', to: '/docs/API_REFERENCE'},
          ],
        },
        {
          title: 'SDKs',
          items: [
            {label: 'JavaScript / TypeScript', href: 'https://www.npmjs.com/package/@erghi-ai/sdk'},
            {label: 'Python', href: 'https://pypi.org/project/erghi-sdk/'},
            {label: '.NET', href: 'https://www.nuget.org/packages/Erghi.SDK'},
            {label: 'All SDKs on GitHub', href: 'https://github.com/ErghiPlatform/erghi-sdks'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'erghi.ai', href: 'https://erghi.ai'},
            {label: 'GitHub Issues', href: 'https://github.com/ErghiPlatform/erghi-sdks/issues'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} ErghiPlatform.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
