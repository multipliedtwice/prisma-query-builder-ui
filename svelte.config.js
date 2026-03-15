import adapter from '@sveltejs/adapter-node';

const config = {
  kit: {
    adapter: adapter({ out: 'build' }),
    alias: { 'generated/*': './generated/*' }
  }
};
export default config;