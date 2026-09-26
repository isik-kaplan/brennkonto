import { parseSync, traverse } from '@babel/core'
import type { NodePath } from '@babel/core'
import { describe, expect, it } from 'vitest'

import {
  DEPENDENCIES_REASON,
  REASON,
  shouldIgnore,
  shouldIgnoreDependencies,
  strykerPlugins,
} from '../../stryker-plugins/ignore-equivalent.mjs'

// Every node in `source` an ignorer would skip, as the source text it spans.
function ignoredIn(
  source: string,
  ignorer: (path: NodePath) => string | undefined = shouldIgnore,
  reason: string = REASON
): string[] {
  const ast = parseSync(source, { filename: 'x.tsx', parserOpts: { plugins: ['jsx', 'typescript'] } })!
  const ignored: string[] = []
  traverse(ast, {
    enter(path: NodePath) {
      const given = ignorer(path)
      if (given) {
        expect(given).toBe(reason)
        ignored.push(source.slice(path.node.start!, path.node.end!))
      }
    },
  })
  return ignored
}

describe('static-layout ignorer', () => {
  it('registers both ignorers as Ignore plugins', () => {
    expect(strykerPlugins).toEqual([
      expect.objectContaining({ kind: 'Ignore', name: 'static-layout' }),
      expect.objectContaining({ kind: 'Ignore', name: 'constant-hook-dependencies' }),
    ])
  })

  it('ignores a static className and a static inline style', () => {
    expect(ignoredIn(`<div className="card" style={{ marginTop: 'var(--x)', flex: 1 }} />`)).toEqual([
      '"card"',
      `{ marginTop: 'var(--x)', flex: 1 }`,
      `'var(--x)'`,
      '1',
    ])
  })

  it('ignores a static template literal', () => {
    expect(ignoredIn('<div className={`card`} />')).toEqual(['`card`'])
  })

  it('ignores the branches of a condition but never the condition itself', () => {
    expect(ignoredIn(`<div className={active ? 'tab is-active' : 'tab'} />`)).toEqual(["'tab is-active'", "'tab'"])
    expect(ignoredIn(`<div style={{ marginTop: error ? 0 : 'var(--x)' }} />`)).toEqual(['0', "'var(--x)'"])
    expect(ignoredIn(`<div className={'x' ? 'a' : 'b'} />`)).toEqual(["'a'", "'b'"])
  })

  it("ignores the values an arrow's expression body returns, like NavLink's className", () => {
    expect(ignoredIn(`<a className={({ isActive }) => (isActive ? 'a is-active' : 'a')} />`)).toEqual([
      "'a is-active'",
      "'a'",
    ])
    expect(ignoredIn(`<a className={(x = 'default') => x} />`)).toEqual([])
  })

  it('ignores the static pieces of a concatenated className, but not the concatenation', () => {
    expect(ignoredIn(`<div className={'row' + (over ? ' is-over' : '')} />`)).toEqual(["'row'", "' is-over'", "''"])
    expect(ignoredIn(`<div style={{ width: size - 'x' }} />`)).toEqual([])
  })

  it('ignores the value of a logical expression', () => {
    expect(ignoredIn(`<div className={cond && 'is-on'} />`)).toEqual(["'is-on'"])
  })

  it('keeps anything computed', () => {
    expect(ignoredIn('<div style={{ height: `${percent}%` }} />')).toEqual([])
    expect(ignoredIn(`<div style={{ height: size, width: 1 }} />`)).toEqual(['1'])
    expect(ignoredIn(`<div style={{ [key]: 1 }} />`)).toEqual(['1'])
    expect(ignoredIn(`<div style={{ ...base }} />`)).toEqual([])
    expect(ignoredIn(`<div className={classes('a')} />`)).toEqual([])
  })

  it('keeps literals outside className and style', () => {
    expect(ignoredIn(`<input type="number" aria-label="Amount" />`)).toEqual([])
    expect(ignoredIn(`const unit = 'g'`)).toEqual([])
    expect(ignoredIn(`<div>{'text'}</div>`)).toEqual([])
    expect(ignoredIn(`<Foo {...{ className: 'x' }} />`)).toEqual([])
  })
})

describe('constant-hook-dependencies ignorer', () => {
  const deps = (source: string) => ignoredIn(source, shouldIgnoreDependencies, DEPENDENCIES_REASON)

  it.each(['useEffect', 'useLayoutEffect', 'useCallback', 'useMemo', 'React.useEffect'])(
    'ignores an empty dependency list on %s',
    (hook) => {
      expect(deps(`${hook}(() => {}, [])`)).toEqual(['[]'])
    }
  )

  it('keeps a list with real dependencies', () => {
    expect(deps('useEffect(() => {}, [load])')).toEqual([])
  })

  it('keeps an empty array anywhere else', () => {
    expect(deps('useState([])')).toEqual([])
    expect(deps('useEffect([], [x])')).toEqual([])
    expect(deps('useEffect([])')).toEqual([])
    expect(deps('const a = []')).toEqual([])
    expect(deps('other(() => {}, [])')).toEqual([])
    expect(deps('a.b.useEffect(() => {}, [])')).toEqual(['[]'])
  })
})
