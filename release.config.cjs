module.exports = {
  branches: ['master'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'angular',
        releaseRules: [
          { type: 'chore', release: 'minor' },
          { type: 'refactor', release: 'minor' },
          { type: 'release-major', release: 'major' },
        ],
        parserOpts: {
          noteKeywords: ['BREAKING-CHANGE-DISABLED'],
        },
      },
    ],
    '@semantic-release/release-notes-generator',
    '@semantic-release/npm',
    '@semantic-release/github',
  ],
};