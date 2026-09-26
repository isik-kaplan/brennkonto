// Stryker ignorers for mutants that are equivalent by construction.
//
// The first is for fixed layout values: a static className string or an inline style of
// constants. Changing one moves pixels, and jsdom lays nothing out - the only test that could tell
// would assert the literal back, which checks spelling, not behavior.
//
// Deliberately narrow. Only a value made entirely of constants is ignored, so anything computed
// still gets mutated and has to be killed:
//   className={isActive ? 'tab is-active' : 'tab'}   - the condition is still mutated
//   style={{ height: `${percent}%` }}                 - so is everything feeding the height
import { PluginKind, declareValuePlugin } from '@stryker-mutator/api/plugin'

const LAYOUT_ATTRIBUTES = new Set(['className', 'style'])
export const REASON = 'Static layout (className/style) - jsdom lays nothing out to observe'

// Nodes a static value can sit inside on its way to the attribute without anything being computed
// from it - `a ? 'x' : 'y'`, `cond && 'x'`, `{ gap: 'x' }`, `() => 'x'`, `{...}` wrappers.
const PASS_THROUGH = new Set([
  'JSXExpressionContainer',
  'ArrowFunctionExpression',
  'ConditionalExpression',
  'LogicalExpression',
  'ObjectProperty',
  'ObjectExpression',
])

function isStatic(node) {
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
      return true
    case 'TemplateLiteral':
      return node.expressions.length === 0
    case 'ObjectExpression':
      return node.properties.every(
        (property) => property.type === 'ObjectProperty' && !property.computed && isStatic(property.value)
      )
    default:
      return false
  }
}

function layoutAttributeOf(path) {
  let child = path.node
  for (let current = path.parentPath; current; current = current.parentPath) {
    if (current.node.type === 'JSXAttribute') return current.node.name.name
    // String concatenation - `'row' + (isOver ? ' is-over' : '')` - passes a static piece through too.
    const concatenates = current.node.type === 'BinaryExpression' && current.node.operator === '+'
    if (!PASS_THROUGH.has(current.node.type) && !concatenates) return null
    // A condition is logic, not a value - `cond` in `cond ? 'a' : 'b'` must stay mutated.
    if (current.node.type === 'ConditionalExpression' && current.node.test === child) return null
    // Only an arrow's expression body is its value - `({ isActive }) => (isActive ? 'a' : 'b')`,
    // react-router's NavLink className. A default parameter value, say, is not.
    if (current.node.type === 'ArrowFunctionExpression' && current.node.body !== child) return null
    child = current.node
  }
  return null
}

export function shouldIgnore(path) {
  if (!isStatic(path.node)) return undefined
  return LAYOUT_ATTRIBUTES.has(layoutAttributeOf(path)) ? REASON : undefined
}

// The second ignorer: an empty dependency list on a React hook. Whatever Stryker puts in it, the
// list is still a constant, so the hook still runs once - equivalent by construction. A list with
// real dependencies (`[load]`) isn't touched; emptying one of those can matter.
const HOOKS_WITH_DEPENDENCIES = new Set(['useEffect', 'useLayoutEffect', 'useCallback', 'useMemo'])
export const DEPENDENCIES_REASON = 'Empty hook dependency list - any constant list runs the hook exactly once'

export function shouldIgnoreDependencies(path) {
  const { node, parentPath } = path
  if (node.type !== 'ArrayExpression' || node.elements.length > 0) return undefined
  const call = parentPath?.node
  if (call?.type !== 'CallExpression' || call.arguments.at(-1) !== node || call.arguments.length < 2) return undefined
  const callee = call.callee.type === 'MemberExpression' ? call.callee.property : call.callee
  return HOOKS_WITH_DEPENDENCIES.has(callee.name) ? DEPENDENCIES_REASON : undefined
}

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, 'static-layout', { shouldIgnore }),
  declareValuePlugin(PluginKind.Ignore, 'constant-hook-dependencies', { shouldIgnore: shouldIgnoreDependencies }),
]
