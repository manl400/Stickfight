module.exports = {
  root: true,
  env: { 
    node: true, 
    es2022: true 
  },
  extends: [
    'eslint:recommended',
    'airbnb-base',
  ],
  ignorePatterns: ['.eslintrc.js'],
  parserOptions: { 
    ecmaVersion: 'latest', 
    sourceType: 'module' 
  },
  rules: {
    'no-console': 'off', // Allow console in server code
    'max-len': ['error', { code: 120 }],
    'import/extensions': ['error', 'always', { ignorePackages: true }],
  },
};
