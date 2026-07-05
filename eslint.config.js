import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'test/**'] },
  {
    files: ['src/**/*.ts', 'schemas/**/*.ts', 'mint/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {},
  }
);
