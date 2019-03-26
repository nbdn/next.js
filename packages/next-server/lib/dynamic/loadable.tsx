import React from 'react'
import { AsyncComponent, loadingOptions, Component } from './index'

interface InterfaceBaseOptions {
  loading: React.ComponentType<loadingOptions> | (() => null),
  delay?: number,
  timeout?: number,
}

interface InterfaceOptions<P> extends InterfaceBaseOptions {
  kind: 'single',
  loader: () => AsyncComponent<P>,
}

interface InterfaceMapOptions<P, T, K extends keyof T> extends InterfaceBaseOptions {
  kind: 'map',
  loader: Record<K, () => Promise<Component<T[K]>>>,
  render: (loaded: Record<K, React.ComponentType<T[K]>>, props: P) => React.ReactNode,
  modules: () => Record<K, Component<T[K]>>,
}

type Options<P, T, K extends keyof T> = InterfaceOptions<P> | InterfaceMapOptions<P, T, K>

type LoaderPromise<P, T, K extends keyof T, O> = Promise<O extends InterfaceOptions<P> ? React.ComponentType<P> : Record<K, React.ComponentType<T[K]>>>

type LoadablePromise<P, T, K extends keyof T, O> = {
  val: LoaderPromise<P, T, K, O> | null,
}

type State<P, T, K extends keyof T, O> = {
  error: Error | null,
  pastDelay: boolean,
  timedOut: boolean,
  loading: boolean,
  loaded: (O extends InterfaceOptions<P> ? React.ComponentType<P> : Record<K, React.ComponentType<T[K]>>) | null,
}

export class Loadable <
  P extends {},
  T extends { [k: string]: {}},
  K extends keyof T,
  O extends Options<P, T, K>
> extends React.Component<P, State<P, T, K, O>> {
  private timeout?: NodeJS.Timeout | number
  private delay?: NodeJS.Timeout | number
  private promise: LoadablePromise<P, T, K, O>
  private options: O

  // promise object is a reference
  constructor(props: P, options: O, promise: LoadablePromise<P, T, K, O>) {
    super(props)

    this.options = {
      delay: 200,
      ...options,
    }

    this.state = {
      pastDelay: !this.options.delay || this.options.delay <= 0,
      timedOut: typeof this.options.timeout !== 'undefined' && this.options.timeout <= 0,
      loading: true,
      loaded: null,
      error: null,
    }

    this.promise = promise

    if (!this.promise.val) this.promise.val = this.bindNewPromise()

    this.promise.val
      .then((loaded) => {
        this.setState({
          loading: false,
          loaded,
        })

        this.clearTimeouts()
      })
      .catch((error) => {
        this.setState({
          loading: false,
          error,
        })

        this.clearTimeouts()
      })
  }

  private static async loadMap<T, K extends keyof T>(loader: Record<K, () => Promise<Component<T[K]>>>): Promise<Record<K, Component<T[K]>>> {
    const components: Array<Promise<[K, Component<T[K]>]>> = []

    for (const l in loader) {
      if (loader.hasOwnProperty(l)) {
        components.push(loader[l]().then((loaded) => [l, loaded] as [K, Component<T[K]>]))
      }
    }

    const map = await Promise.all(components)

    const loaded = { [map[0][0]]: map[0][1] } as Record<K, Component<T[K]>>

    map.forEach((l, k) => {
      if (k !== 0) loaded[l[0]] = l[1]
    })

    return loaded
  }

  public static createPromise<P, T extends {[key: string]: {}}, K extends keyof T, O>(options: Options<P, T, K>) {
    return (Loadable.hasMapLoader(options) ? Loadable.loadMap<T, K>(options.loader) : options.loader()) as LoaderPromise<P, T, K, O>
  }

  private bindNewPromise() {
    if (this.options.timeout) {
      this.timeout = setTimeout(() => {
        this.setState({ timedOut: true })
      }, this.options.timeout)
    }

    if (this.options.delay && this.options.delay !== 0) {
      this.delay = setTimeout(() => {
        this.setState({ pastDelay: true })
      }, this.options.delay)
    }

    return Loadable.createPromise<P, T, K, O>(this.options)
  }

  private clearTimeouts() {
    if (typeof this.delay === 'number') {
      window.clearTimeout(this.delay)
    } else {
      clearTimeout(this.delay as NodeJS.Timeout)
    }

    if (typeof this.timeout === 'number') {
      window.clearTimeout(this.timeout)
    } else {
      clearTimeout(this.timeout as NodeJS.Timeout)
    }
  }

  private retry() {
    this.setState({ error: null, loading: true, timedOut: false })
    this.promise.val = this.bindNewPromise()
  }

  private static hasMapLoader<P, T, K extends keyof T>(options: Options<P, T, K>): options is InterfaceMapOptions<P, T, K> {
    return options.kind === 'map'
  }

  render() {
    if (this.state.loading || this.state.error) {
      return React.createElement(this.options.loading, {
        isLoading: this.state.loading,
        pastDelay: this.state.pastDelay,
        timedOut: this.state.timedOut,
        error: this.state.error,
        retry: this.retry,
      })
    } else if (this.state.loaded) {
      if (Loadable.hasMapLoader(this.options)) {
        return this.options.render(this.state.loaded as Record<K, React.ComponentType<T[K]>>, this.props)
      } else {
        return React.createElement(this.state.loaded as React.ComponentType<P>, this.props)
      }
    } else {
      return null
    }
  }
}