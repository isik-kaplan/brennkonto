module.exports = {
  printWidth: 120,
  semi: false,
  singleQuote: true,
  trailingComma: 'es5',
  plugins: ['@trivago/prettier-plugin-sort-imports'],
  importOrder: ['^react(?:/.*)?$', '^[a-zA-Z@]', '^[./]'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
}
