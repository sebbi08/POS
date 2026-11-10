export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // German nouns (e.g. "Vollbild") are capitalised.
    'subject-case': [0],
  },
};
