export function buildExtensionManifest({ version, description }) {
  return {
    manifest_version: 3,
    name: 'Gemini NanoBanana Watermark Remover',
    version,
    description,
    permissions: ['storage', 'downloads'],
    host_permissions: [
      '<all_urls>',
      'https://gemini.google.com/*',
      'https://business.gemini.google/*',
      'https://*.googleusercontent.com/*',
      'https://lh3.google.com/*'
    ],
    background: {
      service_worker: 'background.js',
      type: 'module'
    },
    action: {
      default_title: 'Gemini Watermark Remover',
      default_popup: 'popup.html'
    },
    content_scripts: [
      {
        matches: [
          'https://gemini.google.com/*',
          'https://business.gemini.google/*'
        ],
        js: ['page-hook.js'],
        run_at: 'document_start',
        world: 'MAIN'
      },
      {
        matches: [
          'https://gemini.google.com/*',
          'https://business.gemini.google/*'
        ],
        js: ['content-script.js'],
        run_at: 'document_start'
      }
    ]
  };
}
